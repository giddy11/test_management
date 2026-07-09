// modules/siteBanner/services/siteBanner.service.ts
import { SiteBannerRepository } from "../repositories/siteBanner.repository";
import type { SiteBanner, SiteBannerAudience } from "../entities/siteBanner.entity";

const { getIO, emitToRoom, emitToUsers } = require("../../../infrastructure/realtime/socketServer");

export interface PublicSiteBanner {
  message: string | null;
  isActive: boolean;
  expiresAt: string | null;
  // Only present for the superadmin — lets the Announcements page manage the
  // banner regardless of who it's targeted at.
  audience?: SiteBannerAudience;
  recipientIds?: string[] | null;
  durationMinutes?: number | null;
}

interface Actor {
  id: string;
  role: string;
}

// Whether `actor` falls inside the banner's target audience, independent of
// whether the banner is currently active.
function isVisibleToActor(banner: SiteBanner, actor: Actor): boolean {
  if (banner.audience === "all") return true;
  if (banner.audience === "admins") return actor.role === "admin" || actor.role === "superadmin";
  return (banner.recipientIds ?? []).includes(actor.id);
}

// Broadcasts live over Socket.IO to exactly the banner's target audience —
// global emit for "all", the shared "admins" room for "admins", or a direct
// per-socket push to each recipient for "custom".
function broadcast(banner: SiteBanner, payload: PublicSiteBanner) {
  if (banner.audience === "all") {
    getIO()?.emit("banner:update", payload);
  } else if (banner.audience === "admins") {
    emitToRoom("admins", "banner:update", payload);
  } else {
    emitToUsers(banner.recipientIds ?? [], "banner:update", payload);
  }
}

export class SiteBannerService {
  static Instance = new SiteBannerService();

  constructor(private readonly repo = SiteBannerRepository.Instance) {}

  // Reads the current banner, lazily deactivating it first if its duration has
  // already lapsed — there is no cron job, so expiry is enforced on read.
  // The superadmin always sees the true state (to manage it); everyone else
  // only sees it if the banner is active AND targets them.
  async getCurrent(actor: Actor): Promise<PublicSiteBanner> {
    let banner = await this.repo.getOrCreate();

    if (banner.isActive && banner.expiresAt && banner.expiresAt.getTime() <= Date.now()) {
      banner = await this.repo.deactivate(banner.updatedBy ?? "system");
    }

    const isSuperadmin = actor.role === "superadmin";
    const effectiveIsActive = isSuperadmin
      ? banner.isActive
      : banner.isActive && isVisibleToActor(banner, actor);

    const shape: PublicSiteBanner = {
      message: effectiveIsActive ? banner.message : null,
      isActive: effectiveIsActive,
      expiresAt: effectiveIsActive ? banner.expiresAt?.toISOString() ?? null : null,
    };

    if (isSuperadmin) {
      shape.audience = banner.audience;
      shape.recipientIds = banner.recipientIds;
      shape.durationMinutes = banner.durationMinutes;
    }

    return shape;
  }

  async activate(
    actorId: string,
    data: {
      message: string;
      durationMinutes: number;
      audience: SiteBannerAudience;
      recipientIds?: string[];
    }
  ): Promise<PublicSiteBanner> {
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + data.durationMinutes * 60_000);

    const banner = await this.repo.activate({
      message: data.message,
      durationMinutes: data.durationMinutes,
      startedAt,
      expiresAt,
      audience: data.audience,
      recipientIds: data.audience === "custom" ? data.recipientIds ?? [] : null,
      updatedBy: actorId,
    });

    const payload: PublicSiteBanner = {
      message: banner.message,
      isActive: banner.isActive,
      expiresAt: banner.expiresAt?.toISOString() ?? null,
      audience: banner.audience,
      recipientIds: banner.recipientIds,
      durationMinutes: banner.durationMinutes,
    };
    broadcast(banner, payload);
    return payload;
  }

  async deactivate(actorId: string): Promise<PublicSiteBanner> {
    const banner = await this.repo.deactivate(actorId);
    const payload: PublicSiteBanner = {
      message: null,
      isActive: false,
      expiresAt: null,
      audience: banner.audience,
      recipientIds: banner.recipientIds,
      durationMinutes: banner.durationMinutes,
    };
    // Tell the same audience that could have seen it that it's now off.
    broadcast(banner, payload);
    return payload;
  }
}
