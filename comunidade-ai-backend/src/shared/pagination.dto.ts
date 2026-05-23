import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export function getPagination(params: { page?: number; limit?: number }) {
  const limit = params.limit ?? 20;
  const page = params.page ?? 1;
  return { skip: (page - 1) * limit, take: limit };
}

