export interface User {
  id: string;
  firstName: string;
  lastName: string;
  birthday: string;
  timezone: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  birthday: string;
  timezone: string;
}

export interface PlanningUser {
  id: string;
  birthday: string;
  timezone: string;
}

export interface ListActiveUsersForPlanningInput {
  afterId: string | null;
  limit: number;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  softDeleteById(id: string): Promise<boolean>;
  listActiveForPlanning(input: ListActiveUsersForPlanningInput): Promise<PlanningUser[]>;
}
