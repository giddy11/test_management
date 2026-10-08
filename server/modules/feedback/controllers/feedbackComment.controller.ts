// modules/feedback/controllers/feedbackComment.controller.ts
// Shared by three route files: the product-team routes and the IT-support
// portal routes both use the staff-facing methods (the service resolves
// which tier owns the ticket); the public routes use the submitter-facing
// ones.
import { FeedbackCommentService } from "../services/feedbackComment.service";
import { toFeedbackCommentResponse } from "../dto/feedback.dto";

const { ApiResponse } = require("../../../shared/response/apiResponse");

// Multipart form fields are strings only — the client JSON-encodes the
// mention id array. A malformed value is treated as "no mentions" rather
// than failing the whole comment post.
function parseMentionedUserIds(raw: unknown): string[] | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : undefined;
  } catch {
    return undefined;
  }
}

export class FeedbackCommentController {
  // ── Staff ────────────────────────────────────────────────────────────────
  static async list(req: any, res: any, next: any) {
    try {
      const comments = await FeedbackCommentService.Instance.listForStaff(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Comments fetched", comments.map(toFeedbackCommentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req: any, res: any, next: any) {
    try {
      const files = (req.files ?? []) as { buffer: Buffer; originalname: string; mimetype: string; size: number }[];
      const comment = await FeedbackCommentService.Instance.addForStaff(
        req.user,
        req.validated.params.id,
        req.validated.body.body,
        files,
        req.validated.body.parentId,
        parseMentionedUserIds(req.validated.body.mentionedUserIds)
      );
      res.status(201).json(ApiResponse.created("Comment posted", toFeedbackCommentResponse(comment)));
    } catch (err) {
      next(err);
    }
  }

  // ── Public (the submitter — email + the same OTP code "My Tickets" uses) ──
  static async publicList(req: any, res: any, next: any) {
    try {
      const comments = await FeedbackCommentService.Instance.listForSubmitter(
        req.validated.params.id,
        req.validated.body.email,
        req.validated.body.code
      );
      res.status(200).json(ApiResponse.ok("Comments fetched", comments.map(toFeedbackCommentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async publicEmailTranscript(req: any, res: any, next: any) {
    try {
      await FeedbackCommentService.Instance.emailTranscriptToSubmitter(
        req.validated.params.id,
        req.validated.body.email,
        req.validated.body.code,
        req.validated.body.timeZone
      );
      res.status(200).json(ApiResponse.ok("Transcript sent", null));
    } catch (err) {
      next(err);
    }
  }

  static async publicCreate(req: any, res: any, next: any) {
    try {
      const files = (req.files ?? []) as { buffer: Buffer; originalname: string; mimetype: string; size: number }[];
      const comment = await FeedbackCommentService.Instance.addForSubmitter(
        req.validated.params.id,
        req.validated.body.email,
        req.validated.body.code,
        req.validated.body.body,
        files,
        req.validated.body.parentId
      );
      res.status(201).json(ApiResponse.created("Comment posted", toFeedbackCommentResponse(comment)));
    } catch (err) {
      next(err);
    }
  }

}
