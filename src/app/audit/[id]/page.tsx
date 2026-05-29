import { AuditDashboard } from "@/components/audit-dashboard/audit-dashboard";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function AuditPage({ params }: Props) {
	const { id } = await params;
	return <AuditDashboard id={id} />;
}
