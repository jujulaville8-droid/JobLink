"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface DailyData {
  date: string;
  users: number;
  seekers: number;
  employers: number;
  applications: number;
  jobs: number;
}

interface StatusData {
  name: string;
  value: number;
}

interface ApplicationStatusData {
  name: string;
  value: number;
}

interface Props {
  dailyData: DailyData[];
  jobStatusData: StatusData[];
  applicationStatusData: ApplicationStatusData[];
  totals: {
    totalUsers: number;
    totalSeekers: number;
    totalEmployers: number;
    totalJobs: number;
    activeJobs: number;
    pendingJobs: number;
    closedJobs: number;
    totalApplications: number;
    totalCompanies: number;
    newUsersThisWeek: number;
    appsThisWeek: number;
    totalReports: number;
  };
}

const JOB_STATUS_COLORS = ["#0d7377", "#f59e0b", "#ef4444", "#6b7280"];
const APP_STATUS_COLORS = ["#3b82f6", "#0d7377", "#22c55e", "#ef4444"];

const cardClass =
  "rounded-2xl border border-border/40 bg-white p-5 shadow-sm";

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`${cardClass} border-l-4 ${color}`}>
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold text-text">{value}</p>
    </div>
  );
}

export default function AnalyticsCharts({
  dailyData,
  jobStatusData,
  applicationStatusData,
  totals,
}: Props) {
  return (
    <div className="space-y-8">
      {/* Summary stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={totals.totalUsers} color="border-l-primary" />
        <StatCard label="Active Jobs" value={totals.activeJobs} color="border-l-blue-500" />
        <StatCard label="Applications" value={totals.totalApplications} color="border-l-emerald-500" />
        <StatCard label="Reports" value={totals.totalReports} color="border-l-red-500" />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Seekers" value={totals.totalSeekers} color="border-l-emerald-500" />
        <StatCard label="Employers" value={totals.totalEmployers} color="border-l-blue-500" />
        <StatCard label="Companies" value={totals.totalCompanies} color="border-l-purple-500" />
        <StatCard label="New Users (7d)" value={totals.newUsersThisWeek} color="border-l-amber-500" />
      </div>

      {/* User signups over time */}
      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-text mb-1">
          New User Signups
        </h3>
        <p className="text-xs text-text-muted mb-4">Last 30 days</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d7377" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#0d7377" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSeekers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradEmployers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="users"
                stroke="#0d7377"
                strokeWidth={2}
                fill="url(#gradUsers)"
                name="Total"
              />
              <Area
                type="monotone"
                dataKey="seekers"
                stroke="#22c55e"
                strokeWidth={1.5}
                fill="url(#gradSeekers)"
                name="Seekers"
              />
              <Area
                type="monotone"
                dataKey="employers"
                stroke="#3b82f6"
                strokeWidth={1.5}
                fill="url(#gradEmployers)"
                name="Employers"
              />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Applications + Jobs posted over time */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-text mb-1">
            Applications Submitted
          </h3>
          <p className="text-xs text-text-muted mb-4">Last 30 days</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="applications" fill="#0d7377" radius={[4, 4, 0, 0]} name="Applications" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-text mb-1">
            Jobs Posted
          </h3>
          <p className="text-xs text-text-muted mb-4">Last 30 days</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="jobs" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Jobs" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Pie charts */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-text mb-1">
            Job Listings by Status
          </h3>
          <p className="text-xs text-text-muted mb-4">Current breakdown</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={jobStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {jobStatusData.map((_, index) => (
                    <Cell
                      key={index}
                      fill={JOB_STATUS_COLORS[index % JOB_STATUS_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ fontSize: "12px", color: "#6b7280" }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-text mb-1">
            Applications by Status
          </h3>
          <p className="text-xs text-text-muted mb-4">Current breakdown</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={applicationStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {applicationStatusData.map((_, index) => (
                    <Cell
                      key={index}
                      fill={APP_STATUS_COLORS[index % APP_STATUS_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ fontSize: "12px", color: "#6b7280" }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
