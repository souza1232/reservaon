export interface ActionResult<T = undefined> {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  data?: T;
}

export function actionError(message: string): ActionResult<never> {
  return { success: false, message };
}

export function actionSuccess<T>(data?: T, message?: string): ActionResult<T> {
  return { success: true, data, message };
}
