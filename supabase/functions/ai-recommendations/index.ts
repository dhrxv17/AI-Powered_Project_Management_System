import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TaskInput {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  deadline?: string | null;
  assignee_id?: string | null;
  created_at?: string | null;
}

interface Recommendation {
  task_id: string;
  task_title: string;
  current_priority: string;
  suggested_priority: string;
  suggested_status?: string;
  reason: string;
  action_type: "priority" | "status" | "deadline" | "flag";
  urgency: "low" | "medium" | "high" | "critical";
}

interface AIResponse {
  recommendations: Recommendation[];
  summary: string;
  deadline_alerts: { task_id: string; task_title: string; alert: string }[];
  suggestions: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { tasks, project_name } = await req.json() as { tasks: TaskInput[]; project_name?: string };

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return new Response(
        JSON.stringify({ error: "No tasks provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    // Always generate deadline alerts (rule-based, always available)
    const deadlineAlerts = generateDeadlineAlerts(tasks);
    const ruleBasedRecs = generateRuleBasedRecommendations(tasks);

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({
          recommendations: ruleBasedRecs,
          summary: generateSummary(ruleBasedRecs, deadlineAlerts, project_name),
          deadline_alerts: deadlineAlerts,
          suggestions: generateSuggestions(ruleBasedRecs, deadlineAlerts, tasks),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use OpenAI for enhanced analysis
    const taskSummary = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline,
      created_at: t.created_at,
    }));

    const prompt = `You are an expert project management AI assistant for${project_name ? ` the project "${project_name}"` : " a project"}. Analyze these active tasks comprehensively:

Tasks:
${JSON.stringify(taskSummary, null, 2)}

Current date: ${new Date().toISOString().split("T")[0]}

Provide a thorough analysis. Respond with a JSON object containing:
1. "recommendations": array of objects, one per task, with:
   - "task_id": the task id
   - "task_title": the task title
   - "current_priority": current priority
   - "suggested_priority": suggested priority (low/medium/high/critical)
   - "suggested_status": suggested status change if warranted (todo/in_progress/review/done), or null if no change
   - "reason": 1-2 sentence explanation
   - "action_type": one of "priority" (priority change), "status" (status change), "deadline" (deadline concern), "flag" (flag for attention)
   - "urgency": "low"/"medium"/"high"/"critical"
2. "summary": 2-3 sentence overall project health assessment
3. "deadline_alerts": array of { "task_id", "task_title", "alert" } for tasks with deadline issues
4. "suggestions": array of 2-3 actionable strings for the project manager

Be decisive. If a task is overdue, suggest critical priority. If a task has been in_progress too long, suggest moving to review. Consider workload balance and blocking dependencies.`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a senior project management AI. Always respond with valid JSON only, no markdown. Be direct and actionable." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 3000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response");

      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      return new Response(
        JSON.stringify({
          recommendations: parsed.recommendations || ruleBasedRecs,
          summary: parsed.summary || generateSummary(ruleBasedRecs, deadlineAlerts, project_name),
          deadline_alerts: parsed.deadline_alerts || deadlineAlerts,
          suggestions: parsed.suggestions || generateSuggestions(ruleBasedRecs, deadlineAlerts, tasks),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch {
      // Fallback to rule-based
      return new Response(
        JSON.stringify({
          recommendations: ruleBasedRecs,
          summary: generateSummary(ruleBasedRecs, deadlineAlerts, project_name),
          deadline_alerts: deadlineAlerts,
          suggestions: generateSuggestions(ruleBasedRecs, deadlineAlerts, tasks),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateDeadlineAlerts(tasks: TaskInput[]) {
  const now = new Date();
  const alerts: { task_id: string; task_title: string; alert: string }[] = [];

  for (const task of tasks) {
    if (task.status === "done" || !task.deadline) continue;
    const deadline = new Date(task.deadline);
    const days = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (days < 0) {
      alerts.push({ task_id: task.id, task_title: task.title, alert: `OVERDUE by ${Math.abs(days)} day(s). Immediate action required.` });
    } else if (days === 0) {
      alerts.push({ task_id: task.id, task_title: task.title, alert: "Due TODAY. Needs immediate attention." });
    } else if (days <= 2) {
      alerts.push({ task_id: task.id, task_title: task.title, alert: `Due in ${days} day(s). At risk of missing deadline.` });
    }
  }
  return alerts;
}

function generateRuleBasedRecommendations(tasks: TaskInput[]): Recommendation[] {
  const now = new Date();
  const priorityOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

  return tasks.map((task) => {
    let suggested = task.priority;
    let reason = "";
    let actionType: Recommendation["action_type"] = "flag";
    let urgency: Recommendation["urgency"] = "low";
    let suggestedStatus: string | null = null;

    if (task.status === "done") {
      return {
        task_id: task.id,
        task_title: task.title,
        current_priority: task.priority,
        suggested_priority: task.priority,
        suggested_status: null,
        reason: "Task is completed. No action needed.",
        action_type: "flag" as const,
        urgency: "low" as const,
      };
    }

    if (task.deadline) {
      const deadline = new Date(task.deadline);
      const days = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (days < 0) {
        suggested = "critical";
        urgency = "critical";
        actionType = "deadline";
        reason = `Overdue by ${Math.abs(days)} day(s). Elevate to critical and focus resources here.`;
        if (task.status === "todo") {
          suggestedStatus = "in_progress";
          reason += " Move to In Progress immediately.";
        }
      } else if (days <= 1) {
        suggested = priorityOrder[task.priority] < priorityOrder["high"] ? "high" : task.priority;
        urgency = "high";
        actionType = "deadline";
        reason = `Due ${days === 0 ? "today" : "tomorrow"}. Ensure it's being actively worked on.`;
        if (task.status === "todo") suggestedStatus = "in_progress";
      } else if (days <= 3) {
        if (priorityOrder[task.priority] < priorityOrder["high"]) {
          suggested = "high";
          actionType = "priority";
        }
        urgency = "medium";
        reason = `Due in ${days} days. ${priorityOrder[task.priority] < priorityOrder["high"] ? "Raise priority to ensure visibility." : "Current priority is appropriate for the timeline."}`;
      } else if (days <= 7) {
        if (priorityOrder[task.priority] < priorityOrder["medium"]) {
          suggested = "medium";
          actionType = "priority";
        }
        urgency = "low";
        reason = `Due in ${days} days. ${priorityOrder[task.priority] < priorityOrder["medium"] ? "Consider raising priority." : "Timeline is manageable."}`;
      } else {
        actionType = "flag";
        urgency = "low";
        reason = "Deadline is comfortably far. Current priority is appropriate.";
      }
    } else {
      // No deadline
      if (task.status === "in_progress") {
        const created = task.created_at ? new Date(task.created_at) : null;
        const age = created ? Math.ceil((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        if (age > 7) {
          suggestedStatus = "review";
          urgency = "medium";
          actionType = "status";
          reason = `In progress for ${age} days without completion. Consider moving to Review for assessment.`;
        } else {
          actionType = "flag";
          urgency = "low";
          reason = "In progress, no deadline set. Consider adding a target date.";
        }
      } else if (task.status === "review") {
        urgency = "medium";
        actionType = "status";
        suggestedStatus = "done";
        reason = "In review - assess if it can be marked complete.";
      } else if (task.status === "todo" && priorityOrder[task.priority] >= priorityOrder["high"]) {
        urgency = "medium";
        actionType = "status";
        suggestedStatus = "in_progress";
        reason = "High priority but still in To Do. Start working on this task.";
      } else {
        actionType = "flag";
        urgency = "low";
        reason = "No deadline set. Consider adding one for better tracking.";
      }
    }

    return {
      task_id: task.id,
      task_title: task.title,
      current_priority: task.priority,
      suggested_priority: suggested,
      suggested_status: suggestedStatus,
      reason,
      action_type: actionType,
      urgency,
    };
  });
}

function generateSummary(recs: Recommendation[], alerts: { task_id: string; alert: string }[], projectName?: string): string {
  const projLabel = projectName ? `"${projectName}"` : "your project";
  const criticalCount = recs.filter((r) => r.urgency === "critical").length;
  const highCount = recs.filter((r) => r.urgency === "high").length;
  const overdueCount = alerts.length;

  if (overdueCount > 0 || criticalCount > 0) {
    return `${projLabel} needs urgent attention: ${overdueCount} deadline alert${overdueCount !== 1 ? "s" : ""} and ${criticalCount} critical task${criticalCount !== 1 ? "s" : ""}. Focus on resolving overdue items first.`;
  }
  if (highCount > 0) {
    return `${projLabel} has ${highCount} task${highCount !== 1 ? "s" : ""} requiring attention soon. Review the high-urgency items to prevent delays.`;
  }
  return `${projLabel} is on track. All tasks are progressing well with no immediate risks. Continue monitoring deadlines.`;
}

function generateSuggestions(recs: Recommendation[], alerts: { task_id: string; alert: string }[], tasks: TaskInput[]): string[] {
  const suggestions: string[] = [];
  const noDeadline = tasks.filter((t) => t.status !== "done" && !t.deadline).length;
  const overdue = alerts.length;
  const highUrgency = recs.filter((r) => r.urgency === "high" || r.urgency === "critical").length;

  if (overdue > 0) suggestions.push(`Address ${overdue} overdue task${overdue !== 1 ? "s" : ""} immediately - reassign or adjust scope if needed.`);
  if (highUrgency > 0) suggestions.push(`Review ${highUrgency} high-urgency task${highUrgency !== 1 ? "s" : ""} and ensure they have clear owners.`);
  if (noDeadline > 0) suggestions.push(`Set deadlines for ${noDeadline} task${noDeadline !== 1 ? "s" : ""} that currently lack due dates for better tracking.`);
  if (tasks.filter((t) => t.status === "todo").length > tasks.length * 0.6) suggestions.push("Over 60% of tasks are still in To Do. Consider starting work on high-priority items.");

  if (suggestions.length === 0) suggestions.push("Project health looks good. Keep up the momentum!");
  return suggestions.slice(0, 4);
}
