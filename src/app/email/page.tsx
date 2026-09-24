"use client";

import { useState } from "react";

export default function EmailPage() {
  const [emailType, setEmailType] = useState("follow-up");
  const [clientName, setClientName] = useState("");
  const [subject, setSubject] = useState("");
  const [points, setPoints] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [tone, setTone] = useState("professional");
  const [yourName, setYourName] = useState("");
  const [copied, setCopied] = useState(false);

  const greeting =
    tone === "friendly" ? `Hi ${clientName || "there"},` : `Hello ${clientName || "there"},`;

  const intro =
    emailType === "follow-up"
      ? "I wanted to follow up on our recent conversation."
      : emailType === "update"
        ? "Here is a quick update on the project."
        : emailType === "onboarding"
          ? "Thank you for getting started. Here is what happens next."
          : emailType === "invoice"
            ? "Please find the invoice details below."
            : "Thank you for your time and trust.";

  const emailText = [
    greeting,
    "",
    intro,
    points ? points : "",
    callToAction ? callToAction : "",
    "",
    tone === "friendly" ? "Thanks so much," : "Best regards,",
    yourName || "Your name",
  ]
    .filter((line, index, arr) => line !== "" || arr[index - 1] !== "")
    .join("\n")
    .trim();

  async function copyEmail() {
    await navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/dashboard" className="text-sm text-slate-600">
            Back to dashboard
          </a>
          <div className="font-semibold">New client email</div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Email details</h1>

          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={emailType}
            onChange={(event) => setEmailType(event.target.value)}
          >
            <option value="follow-up">Follow-up</option>
            <option value="update">Project update</option>
            <option value="onboarding">Onboarding</option>
            <option value="invoice">Invoice reminder</option>
            <option value="thanks">Thank you</option>
          </select>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client name"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Subject / project"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Key points"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Call to action"
            value={callToAction}
            onChange={(event) => setCallToAction(event.target.value)}
          />
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={tone}
            onChange={(event) => setTone(event.target.value)}
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
          </select>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Your name"
            value={yourName}
            onChange={(event) => setYourName(event.target.value)}
          />
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-500">Subject</p>
          <p className="font-medium">{subject || "Email subject"}</p>
          <pre className="mt-6 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">
            {emailText}
          </pre>
          <button
            type="button"
            onClick={copyEmail}
            className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
          >
            {copied ? "Copied" : "Copy email"}
          </button>
        </div>
      </section>
    </main>
  );
}