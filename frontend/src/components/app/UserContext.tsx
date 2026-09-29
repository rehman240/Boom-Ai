"use client";

import { createContext, useContext } from "react";
import type { User } from "@/lib/api";

export const UserContext = createContext<User | null>(null);
export const SetUserContext = createContext<(user: User) => void>(() => {});

/** The signed-in user. Only use inside the (app) layout, which guarantees a user. */
export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used inside the app shell");
  return user;
}

/** Update the signed-in user after settings change, so the shell shows the new details. */
export function useSetUser(): (user: User) => void {
  return useContext(SetUserContext);
}
