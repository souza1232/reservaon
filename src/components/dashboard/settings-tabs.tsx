import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { href: "/painel/configuracoes", label: "Empresa" },
  { href: "/painel/configuracoes/agenda", label: "Agenda" },
  { href: "/painel/configuracoes/horarios", label: "Horários" },
  { href: "/painel/configuracoes/feriados", label: "Feriados" },
];

export function SettingsTabs({ active }: { active: string }) {
  return (
    <Tabs value={active}>
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
