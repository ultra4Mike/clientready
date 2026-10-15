import { noteDate, type ChangeOrderNote } from "@/lib/change-orders";

/** "Change order INV-1043 created Oct 14, 2026" lines on the original invoice. Display only. */
export default function ChangeOrderNotes({ notes, className = "text-xs text-slate-600" }: { notes: ChangeOrderNote[]; className?: string }) {
  if (!notes.length) return null;
  return (
    <div className={className} data-testid="change-order-notes">
      {notes.map((note) => (
        <p key={note.id}>
          Change order <a className="underline" href={`/invoice?id=${encodeURIComponent(note.id)}`}>{note.number}</a>
          {note.createdAt && noteDate(note.createdAt) ? ` created ${noteDate(note.createdAt)}` : ""}
        </p>
      ))}
    </div>
  );
}
