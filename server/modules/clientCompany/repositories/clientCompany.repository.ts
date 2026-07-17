// modules/clientCompany/repositories/clientCompany.repository.ts
import type { Repository } from "typeorm";
import { ClientCompany } from "../entities/clientCompany.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export class ClientCompanyRepository {
  static Instance = new ClientCompanyRepository();

  private repo: Repository<ClientCompany>;

  constructor() {
    this.repo = AppDataSource.getRepository(ClientCompany);
  }

  // A project has at most a handful of client companies — no pagination needed,
  // but the list is still bounded by the projectId index.
  async fetchByProject(projectId: string): Promise<ClientCompany[]> {
    return this.repo.find({
      where: { projectId },
      order: { createdAt: "ASC" },
    });
  }

  async findById(id: string): Promise<ClientCompany | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByFeedbackToken(feedbackToken: string): Promise<ClientCompany | null> {
    return this.repo.findOne({ where: { feedbackToken } }); // indexed
  }

  // Partner integration API auth — the hashed key is the only credential.
  async findByIntegrationApiKeyHash(hash: string): Promise<ClientCompany | null> {
    return this.repo.findOne({ where: { integrationApiKeyHash: hash } });
  }

  // Case-insensitive match across the whole application — used to reject
  // duplicate contact emails when creating/renaming a client company.
  async findByEmail(email: string): Promise<ClientCompany | null> {
    return this.repo
      .createQueryBuilder("company")
      .where("LOWER(company.contact_email) = LOWER(:email)", { email })
      .andWhere("company.deleted_at IS NULL")
      .getOne();
  }

  async create(data: Partial<ClientCompany>): Promise<ClientCompany> {
    return this.repo.save(this.repo.create(data));
  }

  async save(company: ClientCompany): Promise<ClientCompany> {
    return this.repo.save(company);
  }

  async update(
    id: string,
    patch: Partial<Omit<ClientCompany, "project">>
  ): Promise<ClientCompany | null> {
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
