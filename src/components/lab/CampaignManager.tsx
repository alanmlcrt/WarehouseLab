import { useRef, useState } from "react";
import {
  buildCampaign,
  downloadText,
  toCampaignJson,
  toMarkdownReport,
  toPointCloudCsv,
} from "../../experiments/labExport";
import { useSimulationStore } from "../../store/simulationStore";

export function CampaignManager() {
  const labPlan = useSimulationStore((state) => state.labPlan);
  const labResults = useSimulationStore((state) => state.labResults);
  const campaigns = useSimulationStore((state) => state.labCampaigns);
  const saveLabCampaign = useSimulationStore((state) => state.saveLabCampaign);
  const loadLabCampaign = useSimulationStore((state) => state.loadLabCampaign);
  const deleteLabCampaign = useSimulationStore((state) => state.deleteLabCampaign);
  const importLabCampaign = useSimulationStore((state) => state.importLabCampaign);
  const labError = useSimulationStore((state) => state.labError);

  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const hasResults = labResults.length > 0;

  const exportJson = () => {
    const campaign = buildCampaign(name || "campagne", labPlan, labResults);
    downloadText(
      `${slug(campaign.name)}.campaign.json`,
      "application/json",
      toCampaignJson(campaign),
    );
  };
  const exportCsv = () => {
    downloadText(
      `${slug(name || "campagne")}.points.csv`,
      "text/csv",
      toPointCloudCsv(labResults),
    );
  };
  const exportMarkdown = () => {
    const campaign = buildCampaign(name || "campagne", labPlan, labResults);
    downloadText(
      `${slug(campaign.name)}.report.md`,
      "text/markdown",
      toMarkdownReport(campaign),
    );
  };
  const onImportFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    const text = await file.text();
    importLabCampaign(text);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto">
      <div className="rounded-md border border-line bg-white p-3 shadow-sm">
        <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-500">
          Campagne courante — {labResults.length} points en mémoire
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 min-w-[200px] flex-1 rounded border border-line bg-white px-2 text-sm"
            onChange={(event) => setName(event.target.value)}
            placeholder="Nom de la campagne"
            type="text"
            value={name}
          />
          <button
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!hasResults}
            onClick={() => saveLabCampaign(name)}
            type="button"
          >
            Sauvegarder
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            className="rounded border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={!hasResults}
            onClick={exportJson}
            type="button"
          >
            Export JSON
          </button>
          <button
            className="rounded border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={!hasResults}
            onClick={exportCsv}
            type="button"
          >
            Export CSV
          </button>
          <button
            className="rounded border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={!hasResults}
            onClick={exportMarkdown}
            type="button"
          >
            Rapport Markdown
          </button>
          <button
            className="rounded border border-line bg-white px-3 py-1.5 text-xs font-semibold"
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            Importer JSON
          </button>
          <input
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => onImportFile(event.target.files?.[0])}
            ref={fileRef}
            type="file"
          />
        </div>
        {labError ? (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            {labError}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 rounded-md border border-line bg-white p-3 shadow-sm">
        <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-500">
          Campagnes sauvegardées ({campaigns.length})
        </div>
        {campaigns.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-center text-xs text-slate-400">
            Lance un DOE puis sauvegarde-le ici, ou importe une campagne JSON.
          </div>
        ) : (
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-slate-50">
              <tr>
                <Th>Nom</Th>
                <Th>Date</Th>
                <Th className="text-right">Points</Th>
                <Th className="text-right">Seeds</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr className="border-t border-line" key={campaign.id}>
                  <td className="px-2 py-1.5 font-medium text-ink">{campaign.name}</td>
                  <td className="px-2 py-1.5 text-slate-500">
                    {new Date(campaign.createdAt).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right">{campaign.meta.totalPoints}</td>
                  <td className="px-2 py-1.5 text-right">{campaign.meta.seedCount}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      className="mr-2 rounded border border-accent/40 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent hover:text-white"
                      onClick={() => loadLabCampaign(campaign.id)}
                      type="button"
                    >
                      Charger
                    </button>
                    <button
                      className="rounded border border-line px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => deleteLabCampaign(campaign.id)}
                      type="button"
                    >
                      Suppr.
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "campagne"
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 ${
        className ?? ""
      }`}
    >
      {children}
    </th>
  );
}
