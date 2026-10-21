import { redirect } from "next/navigation";

/** R107: old /week links go to Upcoming. */
export default function WeekPage() {
  redirect("/upcoming");
}
