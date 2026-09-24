"use client";

import { useEffect, useState } from "react";

type SavedClient = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
};

type SavedDocument = {
  id: string;
  type: "invoice" | "proposal" | "email";
  title: string;
  clientName: string;
  createdAt: string;
  data: Record<string, unknown>;
};

export default function EmailPage() {
  const [docId, setDocId] = useState("");
  const [emailType, setEmailType] = useState("follow-up");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [points, setPoints] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [tone, setTone] = useState("professional");
  const [yourName, setYourName] = useState("");
  const [copied, setCopied] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [clientSearch, setClientSearch] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-profile");
    if (raw) {
      const profile = JSON.parse(raw);
      setYourName(profile.ownerName || "");
    }
    const clientsRaw = window.localStorage.getItem("clientready-clients");
    if (clientsRaw) setSavedClients(JSON.parse(clientsRaw));
  }, []);

  useEffect(() => {
    const openId = window.localStorage.getItem("clientready-open-document");
    if (!openId) return;
    const raw = window.localStorage.getItem("clientready-documents");
    if (!raw) return;
    const docs = JSON.parse(raw) as SavedDocument[];
    const doc = docs.find((item) => item.id === openId && item.type === "email");
    window.localStorage.removeItem("clientready-open-document");
    if (!doc) return;
    const data = doc.data as {
      emailType?: string;
      clientName?: string;
      clientCompany?: string;
      clientEmail?: string;
      clientPhone?: string;
      clientAddress?: string;
      subject?: string;
      points?: string;
      callToAction?: string;
      tone?: string;
      yourName?: string;
    };
    setDocId(doc.id);
    setEmailType(data.emailType || "follow-up");
    setClientName(data.clientName || "");
    setClientCompany(data.clientCompany || "");
    setClientEmail(data.clientEmail || "");
    setClientPhone(data.clientPhone || "");
    setClientAddress(data.clientAddress || "");
    setSubject(data.subject || "");
    setPoints(data.points || "");
    setCallToAction(data.callToAction || "");
    setTone(data.tone || "professional");
    setYourName(data.yourName || "");
    setClientSearch(data.clientName || "");
  }, []);

  const filteredClients = savedClients.filter((client) => {
    if (!clientSearch.trim()) return false;
    const text = `${client.name} ${client.company} ${client.email}`.toLowerCase();
    return text.includes(clientSearch.toLowerCase());
  });

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
    points,
    callToAction,
    "",
    tone === "friendly" ? "Thanks so much," : "Best regards,",
    yourName || "Your name",
  ]
    .filter((line, index, arr) => line !== "" || arr[index - 1] !== "")
    .join("\n")
    .trim();

  function chooseClient(client: SavedClient) {
    setClientName(client.name || "");
    setClientCompany(client.company || "");
    setClientEmail(client.email || "");
    setClientPhone(client.phone || "");
    setClientAddress(client.address || "");
    setClientSearch(client.name || "");
  }

  function saveClientFromForm() {
    if (!clientName.trim()) {
      setSaveMessage("Add a client name first");
      return;
    }
    const alreadySaved = savedClients.some((client) => {
      if (clientEmail && client.email) {
        return client.email.toLowerCase() === clientEmail.toLowerCase();
      }
      return client.name.toLowerCase() === clientName.toLowerCase();
    });
    if (alreadySaved) {
      setSaveMessage("That client is already saved");
      setTimeout(() => setSaveMessage(""), 2000);
      return;
    }
    const nextClient: SavedClient = {
      id: Date.now().toString(),
      name: clientName,
      company: clientCompany,
      email: clientEmail,
      phone: clientPhone,
      address: clientAddress,
    };
    const next = [...savedClients, nextClient];
    window.localStorage.setItem("clientready-clients", JSON.stringify(next));
    setSavedClients(next);
    setSaveMessage("Client saved");
    setTimeout(() => setSaveMessage(""), 2000);
  }

  function saveDocument() {
    const raw = window.localStorage.getItem("clientready-documents");
    const docs: SavedDocument[] = raw ? JSON.parse(raw) : [];
    const id = docId || Date.now().toString();
    const nextDoc: SavedDocument = {
      id,
      type: "email",
      title: subject || "Client email",
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: {
        emailType,
        clientName,
        clientCompany,
        clientEmail,
        clientPhone,
        clientAddress,
        subject,
        points,
        callToAction,
        tone,
        yourName,
      },
    };
    const next = [...docs.filter((item) => item.id !== id), nextDoc];
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
    setDocId(id);
    setSaveMessage("Email saved");
    setTimeout(() => setSaveMessage(""), 2000);
  }

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

          <div>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Search clients by name"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
            />
            {filteredClients.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {filteredClients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => chooseClient(client)}
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="block font-medium">{client.name}</span>
                    <span className="block text-sm text-slate-500">
                      {client.company || client.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

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
            placeholder="Client company"
            value={clientCompany}
            onChange={(event) => setClientCompany(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client email"
            value={clientEmail}
            onChange={(event) => setClientEmail(event.target.value)}
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

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveDocument}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            >
              Save document
            </button>
            <button
              type="button"
              onClick={saveClientFromForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Save as client
            </button>
          </div>
          {saveMessage && <p className="text-sm text-slate-600">{saveMessage}</p>}
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