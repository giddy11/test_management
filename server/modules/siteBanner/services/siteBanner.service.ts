// modules/siteBanner/services/siteBanner.service.ts
import { SiteBannerRepository } from "../repositories/siteBanner.repository";

const { getIO } = require("../../../infrastructure/realtime/socketServer");

export interface PublicSiteBanner {
  message: string | null;
  isActive: boolean;
  expiresAt: string | null;
}

function toPublicShape(banner: {
  message: string | null;
  isActive: boolean;
  expiresAt: Date | null;
}): PublicSiteBanner {
  return {
    message: banner.isActive ? banner.message : null,
    isActive: banner.isActive,
    expiresAt: banner.isActive ? banner.expiresAt?.toISOString() ?? null : null,
  };
}

export class SiteBannerService {
  static Instance = new SiteBannerService();

  constructor(private readonly repo = SiteBannerRepository.Instance) {}

  // Reads the current banner, lazily deactivating it first if its duration has
  // already lapsed — there is no cron job, so expiry is enforced on read.
  async getCurrent(): Promise<PublicSiteBanner> {
    let banner = await this.repo.getOrCreate();

    if (banner.isActive && banner.expiresAt && banner.expiresAt.getTime() <= Date.now()) {
      banner = await this.repo.deactivate(banner.updatedBy ?? "system");
    }

    return toPublicShape(banner);
  }

  async activate(
    actorId: string,
    data: { message: string; durationMinutes: number }
  ): Promise<PublicSiteBanner> {
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + data.durationMinutes * 60_000);

    const banner = await this.repo.activate({
      message: data.message,
      durationMinutes: data.durationMinutes,
      startedAt,
      expiresAt,
      updatedBy: actorId,
    });

    const payload = toPublicShape(banner);
    getIO()?.emit("banner:update", payload);
    return payload;
  }

  async deactivate(actorId: string): Promise<PublicSiteBanner> {
    const banner = await this.repo.deactivate(actorId);
    const payload = toPublicShape(banner);
    getIO()?.emit("banner:update", payload);
    return payload;
  }
}
