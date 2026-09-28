"use client";

import { createContext, useContext } from "react";
import type { User } from "@/lib/api";

export const UserContext = createContext<User | null>(null);

/** The signed-in user. Only use inside the (app) layout, which guarantees a user. */
export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used inside the app shell");
  return user;
}
