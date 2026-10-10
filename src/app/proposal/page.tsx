"use client";

import { useEffect } from "react";

export default function ProposalRedirect() {
  useEffect(() => {
    window.localStorage.setItem("clientready-new-type", "proposal");
    window.location.href = "/invoice";
  }, []);
  return null;
}