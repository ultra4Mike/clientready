import { redirect } from "next/navigation";

/** /team is a common guess for the crew list; it lives at /employees. */
export default function TeamRedirect() {
  redirect("/employees");
}
