export const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type ServiceType = {
  id: string;
  name: string;
  weekday: number | null;
  sort_order: number;
  is_active: boolean;
};
