import React from 'react';
import { useTranslation } from 'react-i18next';
import { LucideIcon, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface PlaceholderScreenProps {
  title: string;
  stageNumber: number;
  stageKey: string;
  description: string;
  icon: LucideIcon;
  plannedFeatures: string[];
  connections: string[];
}

export const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({
  title,
  stageNumber,
  stageKey,
  description,
  icon: Icon,
  plannedFeatures,
  connections,
}) => {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                Stage {stageNumber}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
          <span className="font-semibold text-slate-800 block mb-1">
            Build Stage Roadmap:
          </span>
          {t(`stages.${stageKey}`)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Planned Features */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Planned Architectural Capabilities
            </h3>
            <ul className="space-y-2 text-xs text-slate-600">
              {plannedFeatures.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Connected Modules */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <ArrowRight className="w-4 h-4 text-indigo-600" />
              Inter-Module Connections
            </h3>
            <ul className="space-y-2 text-xs text-slate-600">
              {connections.map((conn, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <span>{conn}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            Controlled by Stage-by-Stage build instructions
          </span>
          <span>Foundation (Stage 1) is active</span>
        </div>
      </div>
    </div>
  );
};
