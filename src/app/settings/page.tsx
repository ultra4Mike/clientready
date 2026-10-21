import { redirect } from "next/navigation";

/** R111: old /settings links go to Profile. */
export default function SettingsPage() {
  redirect("/profile");
}
