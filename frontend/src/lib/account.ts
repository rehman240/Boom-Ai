import { api, type User } from "@/lib/api";

export const updateWorkspace = (workspace_name: string) =>
  api<User>("/account", { method: "PATCH", json: { workspace_name } });

export const changeEmail = (email: string, password: string) =>
  api<User>("/account/email", { method: "POST", json: { email, password } });

export const changePassword = (current_password: string, new_password: string) =>
  api<void>("/account/password", { method: "POST", json: { current_password, new_password } });

export const deleteAccount = (password: string) =>
  api<void>("/account/delete", { method: "POST", json: { password } });

/** The export is a file download, so the browser fetches it directly from this URL. */
export const EXPORT_URL = "/api/account/export";
