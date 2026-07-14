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
