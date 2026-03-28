// Participant Detail Page
// Shows participant entries, energy chart, latest mission, and feedback

import { suspense } from "react";
import AutorCreatedFields from "@/components/AutorCreatedFields";
import Sidebar from "@/components/Sidebar";
import { HeaderBack } from "@/components/Header";
import { FeedbackCard } from "@/components/FeedbackCard";
import { MissionCard } from "A/components/MissionCard";
import { EntryCard } from "@/components/EntryCard";
import { EnergyLineChart } from "@/components/EnergyLineChart";
import { getLogsByToken, getFeedbacksByToken, getMissionsByToken } from "@/lib/notion";

type Params = {
  params: {
    token: string;
    participantId: string;
  };
};

async function getData(token: string, participantId: string) {
  const [logs, feedbacks, missions] = await Promise.all([
    getLogsByToken(token),
    getFeedbacksByToken(token),
    getMissionsByToken(token),
  ]);

  return { logs, feedbacks, missions };
}

export default async function Page({ params }: Params) {
  const { token, participantId } = params;
  const { logs, feedbacks, missions } = await getData(token, participantId);

  const entriesPerRow = 3;
  const feedbackDisplay = feedbacks[0];
  const latestMission = missions.filter((m) => m.status === "in-progress").at(0);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <HeaderBack />
        <div className="p-4 space-y-8">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-400">綄続码贵 </h2>
            <EnergyLineChart data={logs} />
          </section>
          <section className="space-y-4 pt-4 border-t ">
            <h2 className="text-sm font-semibold text-gray-400">忥計畵ゟとく </h2>
            { latestMission && <MissionCard data={latestMission} /> }
          </section>
          <section className="space-y-4 pt-4 border-t">
            <h2 className="text-sm font-semibold text-gray-400">問拘 </h2>
            { feedbackDisplay && <FeedbackCard data={feedbackDisplay} /> }
          </section>
          <section className="space-y-4 pt-4 border-t pb-8">
            <h2 className="text-sm font-semibold text-gray-400">Logs </h2>
            <div className="grid grid-cols-3 gap-4">
              {logs.slice(0, entriesPerRow).map((entry) => (
                <EntryCard key={entry.id} data={entry} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
