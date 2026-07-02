// modules/featureRequest/repositories/featureRequestVote.repository.js
const { In } = require("typeorm");
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { FeatureRequestVote } = require("../entities/featureRequestVote.entity");
const { FeatureRequest } = require("../entities/featureRequest.entity");

class FeatureRequestVoteRepository {
  static Instance = new FeatureRequestVoteRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(FeatureRequestVote);
  }

  async findByRequestAndUser(featureRequestId, userId) {
    return this.repo.findOne({ where: { featureRequestId, userId } });
  }

  // Batch — which of these feature requests has `userId` already voted on?
  async votedSetForUser(featureRequestIds, userId) {
    if (!featureRequestIds.length) return new Set();
    const rows = await this.repo.find({
      where: { userId, featureRequestId: In(featureRequestIds) },
      select: ["featureRequestId"],
    });
    return new Set(rows.map((r) => r.featureRequestId));
  }

  // Atomic toggle — the vote row and the denormalized counter move together,
  // or not at all, so upvoteCount never drifts from the actual vote rows.
  async toggle(featureRequestId, userId) {
    return AppDataSource.transaction(async (manager) => {
      const voteRepo = manager.getRepository(FeatureRequestVote);
      const frRepo = manager.getRepository(FeatureRequest);

      const existing = await voteRepo.findOne({ where: { featureRequestId, userId } });
      let voted;
      if (existing) {
        await voteRepo.delete(existing.id);
        await frRepo.decrement({ id: featureRequestId }, "upvoteCount", 1);
        voted = false;
      } else {
        await voteRepo.save(voteRepo.create({ featureRequestId, userId }));
        await frRepo.increment({ id: featureRequestId }, "upvoteCount", 1);
        voted = true;
      }

      const updated = await frRepo.findOne({ where: { id: featureRequestId } });
      return { voted, upvoteCount: updated.upvoteCount };
    });
  }
}

module.exports = { FeatureRequestVoteRepository };
