import PortalThemeToggle from "@/components/PortalThemeToggle";

export default function ClientFacingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PortalThemeToggle />
      {children}
    </>
  );
}
