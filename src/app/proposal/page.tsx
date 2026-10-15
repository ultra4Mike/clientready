"use client";

import { useEffect } from "react";

/**
 * /proposal          -> new proposal in the shared invoice/proposal editor
 * /proposal?id=<id>  -> /invoice?id=<id> (the editor switches to proposal mode from the saved type)
 */
export default function ProposalRedirect() {
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      window.location.replace(`/invoice?id=${encodeURIComponent(id)}`);
      return;
    }
    window.localStorage.setItem("clientready-new-type", "proposal");
    window.location.replace("/invoice");
  }, []);
  return null;
}
