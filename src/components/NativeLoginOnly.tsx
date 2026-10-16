"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";

/** On a page that is only about buying or marketing (/plans, home), the native app goes to /login instead. */
export default function NativeLoginOnly() {
  useEffect(() => {
    if (isNativeApp()) window.location.replace("/login");
  }, []);
  return null;
}
