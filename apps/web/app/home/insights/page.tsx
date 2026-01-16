'use client';

import React, { useMemo, useState } from 'react';
import { PageBody } from '@kit/ui/page';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Users,
  Wrench,
  Brain,
  Star,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Activity,
  Target,
  Zap,
  Shield,
  AlertCircle,
  BarChart3,
  PieChart,
  Award,
  Wrench as Tool,
  Filter,
  Search,
  Calendar,
  Package,
  BookOpen,
  UserX,
  Lightbulb,
  TrendingDown as TrendDown,
  UserCheck,
  Briefcase,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RePieChart, Pie, Cell, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { useWorkOrders, useAssets } from '@kit/shared/localdb/hooks';

interface TechnicianStats {
  name: string;
  totalRepairs: number;
  completedRepairs: number;
  inProgressRepairs: number;
  plannedRepairs: number;
  successRate: number;
  avgRepairTime: number;
  totalHours: number;
  internalHours: number;
  externalHours: number;
  rating: number;
  specializations: { type: string; count: number; successRate: number }[];
  trainingNeeds: string[];
  recentActivity: number;
  isAtRisk: boolean;
  efficiency: number;
}

interface MachineInsight {
  machineId: string;
  machineName: string;
  failureCount: number;
  avgDowntime: number;
  totalCost: number;
  riskScore: number;
  failureTypes: { type: string; count: number }[];
  lastFailureDate: Date | null;
  interventionDates: Date[];
  avgInterval: number;
  maintenanceType: 'preventive' | 'corrective' | 'mixed';
  nextFailureProbability: number;
  daysUntilNextFailure: number;
  recommendations: string[];
  criticality: string;
}

// NEW: Skill Gap Analysis
interface SkillGap {
  skill: string;
  demandCount: number;
  qualifiedTechnicians: number;
  gap: number;
  impactedInterventions: number;
  avgDelay: number;
}

// NEW: Workload Alert
interface WorkloadAlert {
  technicianName: string;
  weeklyHours: number;
  capacityPercent: number;
  status: 'overloaded' | 'optimal' | 'underutilized';
  recommendation: string;
}

// NEW: Technician-Machine Correlation
interface TechnicianPerformanceCorrelation {
  technicianName: string;
  machinesServiced: number;
  avgSuccessRate: number;
  preventiveImpact: number;
  qualityScore: number;
  repeatFailureRate: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

export default function InsightsPage() {
  const workOrders = useWorkOrders();
  const assets = useAssets();
  
  const [technicianSearch, setTechnicianSearch] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState<string>('all');
  const [machineRiskFilter, setMachineRiskFilter] = useState<string>('all');
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // Format: 'YYYY-MM' or 'all'

  // Generate available months from workOrders
  const availableMonths = useMemo(() => {
    if (!workOrders || workOrders.length === 0) return [];
    
    const monthsSet = new Set<string>();
    workOrders.forEach(wo => {
      const date = wo.endAt || wo.startAt || wo.createdAt;
      if (date) {
        const d = new Date(date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthsSet.add(monthKey);
      }
    });
    
    return Array.from(monthsSet).sort().reverse();
  }, [workOrders]);

  // Filter workOrders by selected month
  const filteredWorkOrders = useMemo(() => {
    if (!workOrders || selectedMonth === 'all') return workOrders;
    
    return workOrders.filter(wo => {
      const date = wo.endAt || wo.startAt || wo.createdAt;
      if (!date) return false;
      
      const d = new Date(date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return monthKey === selectedMonth;
    });
  }, [workOrders, selectedMonth]);

  // Calculate technician statistics
  const technicianStats = useMemo<TechnicianStats[]>(() => {
    if (!workOrders || workOrders.length === 0) return [];

    const statsMap = new Map<string, any>();

    workOrders.forEach((wo) => {
      // Extract technician name from customColumns or assignee
      const firstName = wo.customColumns?.staffFirstName;
      const lastName = wo.customColumns?.staffLastName;
      const techName = (firstName && lastName) 
        ? `${firstName} ${lastName}`.trim() 
        : wo.assignee?.trim() || null;

      if (!techName || techName === '' || techName.toLowerCase() === 'unknown') return;

      if (!statsMap.has(techName)) {
        statsMap.set(techName, {
          name: techName,
          totalRepairs: 0,
          completedRepairs: 0,
          inProgressRepairs: 0,
          plannedRepairs: 0,
          successfulRepairs: 0,
          failedRepairs: 0,
          totalMinutes: 0,
          totalCost: 0,
          totalHours: 0,
          internalHours: 0,
          externalHours: 0,
          repairTimes: [] as number[],
          specializations: {} as Record<string, { count: number; successful: number }>,
          recentRepairs: [] as Date[],
        });
      }

      const stats = statsMap.get(techName);
      stats.totalRepairs += 1;

      // Count by status
      if (wo.endAt) {
        stats.completedRepairs += 1;
        // Success if completed and status is not "failed"
        if (wo.status !== 'failed' && wo.status !== 'cancelled') {
          stats.successfulRepairs += 1;
        } else {
          stats.failedRepairs += 1;
        }
      } else if (wo.startAt) {
        stats.inProgressRepairs += 1;
      } else {
        stats.plannedRepairs += 1;
      }

      // Calculate repair time (in hours) - SIMPLIFIED AND CONSERVATIVE
      let interventionHours = 0;
      
      // ONLY use real date calculations, ignore potentially corrupted custom columns
      if (wo.startAt && wo.endAt) {
        const startDate = new Date(wo.startAt);
        const endDate = new Date(wo.endAt);
        const repairHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
        
        // VERY Strict validation: between 0.1h and 8h (1 workday max per intervention)
        // This prevents overnight/multi-day accumulations
        if (repairHours > 0.1 && repairHours <= 8) {
          stats.repairTimes.push(repairHours);
          interventionHours = repairHours;
        } else if (repairHours > 8 && repairHours <= 24) {
          // If between 8-24h, assume it's a 1-day intervention (capped at 8h)
          stats.repairTimes.push(8);
          interventionHours = 8;
        }
        // If > 24h, ignore completely as it's likely bad data
      }

      // Conservative approach: use ONLY calculated hours OR sensible defaults
      // Completely ignore customColumns hours as they may be corrupted/cumulative
      if (interventionHours > 0) {
        // We have real data from dates
        stats.totalHours += interventionHours;
        stats.internalHours += interventionHours;
        stats.externalHours += 0; // Don't add external without proof
      } else {
        // No dates available: use VERY conservative estimates
        const estimatedHours = wo.endAt ? 1.5 : (wo.startAt ? 1 : 0.5); // Completed: 1.5h, In-progress: 1h, Planned: 0.5h
        stats.totalHours += estimatedHours;
        stats.internalHours += estimatedHours;
      }

      // Cost
      const cost = wo.customColumns?.cost || 0;
      stats.totalCost += cost;

      // Specializations (by problem type or work order type)
      const problemType = wo.customColumns?.failureType || wo.type || 'Other';
      if (!stats.specializations[problemType]) {
        stats.specializations[problemType] = { count: 0, successful: 0 };
      }
      stats.specializations[problemType].count += 1;
      if (wo.endAt && wo.status !== 'failed' && wo.status !== 'cancelled') {
        stats.specializations[problemType].successful += 1;
      }

      // Recent activity (last 30 days)
      if (wo.endAt) {
        const completionDate = new Date(wo.endAt);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (completionDate >= thirtyDaysAgo) {
          stats.recentRepairs.push(completionDate);
        }
      }
    });

    // Convert map to array and calculate final metrics
    return Array.from(statsMap.values()).map((stats) => {
      const successRate = stats.completedRepairs > 0 
        ? (stats.successfulRepairs / stats.completedRepairs) * 100 
        : 0;
      
      const avgRepairTime = stats.repairTimes.length > 0
        ? stats.repairTimes.reduce((sum: number, time: number) => sum + time, 0) / stats.repairTimes.length
        : 0;

      // DEBUG LOG - See actual values
      console.log(`📊 ${stats.name}:`, {
        totalRepairs: stats.totalRepairs,
        totalHours: Math.round(stats.totalHours * 10) / 10,
        internalHours: Math.round(stats.internalHours * 10) / 10,
        avgPerIntervention: stats.totalRepairs > 0 ? (stats.totalHours / stats.totalRepairs).toFixed(1) + 'h' : 'N/A',
        repairTimesCount: stats.repairTimes.length,
      });

      // Calculate efficiency (repairs completed per hour worked)
      const efficiency = stats.totalHours > 0 
        ? (stats.completedRepairs / stats.totalHours) * 100 
        : 0;

      // Calculate overall rating (0-5 stars)
      // Success rate: 60%, Speed: 20%, Efficiency: 20%
      const speedScore = Math.max(0, 100 - (avgRepairTime * 5)); // Lower repair time = better
      const efficiencyScore = Math.min(100, efficiency * 10); // Cap at 100
      const overallScore = (successRate * 0.6) + (speedScore * 0.2) + (efficiencyScore * 0.2);
      const rating = Math.min(5, Math.max(0, (overallScore / 100) * 5));

      // Get top 3 specializations
      const specializationArray = Object.entries(stats.specializations)
        .map(([type, data]: [string, any]) => ({
          type,
          count: data.count,
          successRate: data.count > 0 ? (data.successful / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      // Identify training needs (specializations with <70% success rate)
      const trainingNeeds = Object.entries(stats.specializations)
        .filter(([_, data]: [string, any]) => {
          const specSuccessRate = data.count > 0 ? (data.successful / data.count) * 100 : 0;
          return data.count >= 3 && specSuccessRate < 70;
        })
        .map(([type]) => type);

      // At-risk technician: success rate < 70% and recent repairs > 5
      const isAtRisk = successRate < 70 && stats.recentRepairs.length > 5;

      return {
        name: stats.name,
        totalRepairs: stats.totalRepairs,
        completedRepairs: stats.completedRepairs,
        inProgressRepairs: stats.inProgressRepairs,
        plannedRepairs: stats.plannedRepairs,
        successRate: Math.round(successRate),
        avgRepairTime: Math.round(avgRepairTime * 10) / 10,
        totalHours: Math.round(stats.totalHours * 10) / 10,
        internalHours: Math.round(stats.internalHours * 10) / 10,
        externalHours: Math.round(stats.externalHours * 10) / 10,
        rating: Math.round(rating * 10) / 10,
        specializations: specializationArray,
        trainingNeeds,
        recentActivity: stats.recentRepairs.length,
        isAtRisk,
        efficiency: Math.round(efficiency * 10) / 10,
      };
    }).sort((a, b) => b.rating - a.rating);
  }, [filteredWorkOrders]);

  // Calculate machine insights
  const machineInsights = useMemo<MachineInsight[]>(() => {
    if (!filteredWorkOrders || filteredWorkOrders.length === 0 || !assets) return [];

    const machineMap = new Map<string, any>();

    filteredWorkOrders.forEach((wo) => {
      // Get machine from assetId or customColumns
      const assetId = wo.assetId;
      const asset = assets.find((a) => a.id === assetId);
      const machineName = asset?.name || wo.customColumns?.assetName || wo.customColumns?.machine || null;
      
      if (!machineName || machineName === '' || machineName.toLowerCase() === 'unknown') return;

      if (!machineMap.has(machineName)) {
        machineMap.set(machineName, {
          machineId: assetId || machineName,
          machineName,
          failures: 0,
          totalDowntime: 0,
          totalCost: 0,
          failureTypes: {} as Record<string, number>,
          interventionDates: [] as Date[],
          repairsByType: { preventive: 0, corrective: 0, scheduled: 0, unscheduled: 0 },
          criticality: asset?.criticality || 'B',
        });
      }

      const machine = machineMap.get(machineName);
      machine.failures += 1;

      // Downtime
      const downtime = wo.downtimeMinutes || 0;
      machine.totalDowntime += downtime;

      // Cost
      const cost = wo.customColumns?.cost || 0;
      machine.totalCost += cost;

      // Failure types
      const failureType = wo.customColumns?.failureType || wo.type || 'Other';
      machine.failureTypes[failureType] = (machine.failureTypes[failureType] || 0) + 1;

      // Intervention dates
      const interventionDate = wo.endAt || wo.startAt || wo.createdAt;
      if (interventionDate) {
        machine.interventionDates.push(new Date(interventionDate));
      }

      // Classify maintenance type
      const woType = (wo.type || '').toLowerCase();
      if (woType.includes('preventive') || woType.includes('préventive') || wo.status === 'planned') {
        machine.repairsByType.preventive += 1;
        machine.repairsByType.scheduled += 1;
      } else {
        machine.repairsByType.corrective += 1;
        machine.repairsByType.unscheduled += 1;
      }
    });

    // Convert to array and calculate final metrics
    return Array.from(machineMap.values()).map((machine) => {
      // Sort intervention dates
      machine.interventionDates.sort((a: Date, b: Date) => a.getTime() - b.getTime());

      // Calculate failure intervals
      const intervals: number[] = [];
      for (let i = 1; i < machine.interventionDates.length; i++) {
        const intervalDays = (machine.interventionDates[i].getTime() - machine.interventionDates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
        if (intervalDays > 0 && intervalDays < 365) { // Sanity check
          intervals.push(intervalDays);
        }
      }

      const avgInterval = intervals.length > 0
        ? intervals.reduce((sum, val) => sum + val, 0) / intervals.length
        : 30;

      // Calculate standard deviation for variability
      const stdDev = intervals.length > 1
        ? Math.sqrt(
            intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length
          )
        : avgInterval * 0.3;

      // Last failure date
      const lastFailureDate = machine.interventionDates.length > 0
        ? machine.interventionDates[machine.interventionDates.length - 1]
        : null;

      // Days since last failure
      const daysSinceLastFailure = lastFailureDate
        ? Math.floor((new Date().getTime() - lastFailureDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Predict next failure using normal distribution
      const daysUntilNextFailure = Math.max(0, Math.round(avgInterval - daysSinceLastFailure));
      
      // Probability calculation (simplified normal distribution)
      const zScore = stdDev > 0 ? (daysSinceLastFailure - avgInterval) / stdDev : 0;
      const nextFailureProbability = Math.min(95, Math.max(5, Math.round(50 + (zScore / 3) * 50)));

      // Determine maintenance type
      const totalRepairs = machine.repairsByType.preventive + machine.repairsByType.corrective;
      const preventiveRatio = totalRepairs > 0 ? machine.repairsByType.preventive / totalRepairs : 0;
      
      let maintenanceType: 'preventive' | 'corrective' | 'mixed';
      if (preventiveRatio > 0.7) maintenanceType = 'preventive';
      else if (preventiveRatio < 0.3) maintenanceType = 'corrective';
      else maintenanceType = 'mixed';

      // Calculate risk score (0-100)
      const failureFrequency = machine.failures / Math.max(1, intervals.length || 1);
      const avgDowntime = machine.totalDowntime / Math.max(1, machine.failures);
      const avgCost = machine.totalCost / Math.max(1, machine.failures);

      const riskScore = Math.min(
        100,
        (failureFrequency * 30) +
          (Math.min(avgDowntime / 60, 100) * 25) +
          (Math.min(avgCost / 1000, 100) * 25) +
          (nextFailureProbability * 0.20)
      );

      // Generate recommendations
      const recommendations: string[] = [];
      if (riskScore > 75) {
        recommendations.push('⚠️ Critical: Schedule immediate maintenance');
      } else if (riskScore > 50) {
        recommendations.push('⚡ High priority: Plan maintenance within 1 week');
      }
      
      if (maintenanceType === 'corrective') {
        recommendations.push(`🛡️ Switch to preventive maintenance every ${Math.round(avgInterval)} days`);
      }
      
      if (nextFailureProbability > 70) {
        recommendations.push(`📊 ${nextFailureProbability}% probability of failure in ${daysUntilNextFailure} days`);
      }

      if (avgCost > 500) {
        recommendations.push('💰 High maintenance cost - consider asset replacement');
      }

      // Failure types array
      const failureTypesArray = Object.entries(machine.failureTypes)
        .map(([type, count]) => ({ type, count: count as number }))
        .sort((a, b) => b.count - a.count);

      return {
        machineId: machine.machineId,
        machineName: machine.machineName,
        failureCount: machine.failures,
        avgDowntime: Math.round(machine.totalDowntime / Math.max(1, machine.failures)),
        totalCost: Math.round(machine.totalCost),
        riskScore: Math.round(riskScore),
        failureTypes: failureTypesArray,
        lastFailureDate,
        interventionDates: machine.interventionDates,
        avgInterval: Math.round(avgInterval),
        maintenanceType,
        nextFailureProbability,
        daysUntilNextFailure,
        recommendations,
        criticality: machine.criticality,
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [filteredWorkOrders, assets]);

  // ========== NEW: SKILL GAP ANALYSIS ==========
  const skillGapAnalysis = useMemo<SkillGap[]>(() => {
    if (!filteredWorkOrders || !technicianStats.length) return [];

    // Count demand for each skill type
    const skillDemand: Record<string, { count: number; delays: number[]; }> = {};
    const technicianSkills: Record<string, Set<string>> = {};

    // Build technician skills map from specializations
    technicianStats.forEach(tech => {
      technicianSkills[tech.name] = new Set(
        tech.specializations.map(s => s.type)
      );
    });

    // Analyze work orders for skill gaps
    filteredWorkOrders.forEach(wo => {
      const skillRequired = wo.customColumns?.failureType || wo.type || 'Other';
      
      if (!skillDemand[skillRequired]) {
        skillDemand[skillRequired] = { count: 0, delays: [] };
      }
      skillDemand[skillRequired].count += 1;

      // Calculate delay if intervention was delayed
      if (wo.createdAt && wo.startAt) {
        const delay = (new Date(wo.startAt).getTime() - new Date(wo.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (delay > 1) { // More than 1 day delay
          skillDemand[skillRequired].delays.push(delay);
        }
      }
    });

    // Calculate gaps
    return Object.entries(skillDemand)
      .map(([skill, data]) => {
        // Count qualified technicians for this skill
        const qualified = Array.from(Object.values(technicianSkills))
          .filter(skillSet => skillSet.has(skill))
          .length;

        const avgDelay = data.delays.length > 0
          ? data.delays.reduce((a, b) => a + b, 0) / data.delays.length
          : 0;

        return {
          skill,
          demandCount: data.count,
          qualifiedTechnicians: qualified,
          gap: Math.max(0, data.count - qualified * 10), // Assume 1 tech can handle ~10 interventions
          impactedInterventions: data.delays.length,
          avgDelay: Math.round(avgDelay * 10) / 10,
        };
      })
      .filter(gap => gap.gap > 0 || gap.impactedInterventions > 3)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 5);
  }, [filteredWorkOrders, technicianStats]);

  // ========== NEW: WORKLOAD ALERTS ==========
  const workloadAlerts = useMemo<WorkloadAlert[]>(() => {
    if (!workOrders || !technicianStats.length) return [];

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return technicianStats.map(tech => {
      // Calculate upcoming workload (next 7 days)
      const upcomingWork = workOrders.filter(wo => {
        const techName = wo.customColumns?.staffFirstName && wo.customColumns?.staffLastName
          ? `${wo.customColumns.staffFirstName} ${wo.customColumns.staffLastName}`.trim()
          : wo.assignee?.trim();
        
        const isThisTech = techName === tech.name;
        const startDate = wo.startAt ? new Date(wo.startAt) : null;
        const isUpcoming = startDate && startDate >= now && startDate <= oneWeekAhead;

        return isThisTech && (isUpcoming || !wo.endAt); // Include in-progress and upcoming
      });

      // Sum estimated hours - USE REALISTIC ESTIMATES
      const weeklyHours = upcomingWork.reduce((sum, wo) => {
        let estimatedHours = 0;
        
        // 1. Try to calculate from dates if available
        if (wo.startAt && wo.endAt) {
          const duration = (new Date(wo.endAt).getTime() - new Date(wo.startAt).getTime()) / (1000 * 60 * 60);
          if (duration > 0 && duration < 100) {
            estimatedHours = duration;
          }
        }
        
        // 2. Fallback: use custom hours with sanity checks
        if (estimatedHours === 0) {
          const customInternal = wo.customColumns?.internalHours || 0;
          const customTotal = wo.customColumns?.totalHours || 0;
          
          // Use internal hours first (more reliable), cap at 24h per intervention
          if (customInternal > 0 && customInternal < 24) {
            estimatedHours = customInternal;
          } else if (customTotal > 0 && customTotal < 24) {
            estimatedHours = customTotal;
          } else {
            // Default: 4h for typical intervention
            estimatedHours = 4;
          }
        }
        
        return sum + estimatedHours;
      }, 0);

      const capacityPercent = Math.round((weeklyHours / 40) * 100); // Assume 40h/week capacity

      let status: 'overloaded' | 'optimal' | 'underutilized';
      let recommendation: string;

      if (capacityPercent > 120) {
        status = 'overloaded';
        recommendation = `⚠️ Risque de surcharge - Réassigner ${Math.round((weeklyHours - 48) / 8)} interventions`;
      } else if (capacityPercent > 100) {
        status = 'overloaded';
        recommendation = '⚡ Surcharge légère - Surveiller';
      } else if (capacityPercent < 50) {
        status = 'underutilized';
        recommendation = `💡 Capacité disponible - Peut prendre ${Math.round((40 - weeklyHours) / 8)} interventions`;
      } else {
        status = 'optimal';
        recommendation = '✅ Charge optimale';
      }

      return {
        technicianName: tech.name,
        weeklyHours: Math.round(weeklyHours * 10) / 10,
        capacityPercent,
        status,
        recommendation,
      };
    })
    .filter(alert => alert.status !== 'optimal') // Only show alerts
    .sort((a, b) => b.capacityPercent - a.capacityPercent);
  }, [filteredWorkOrders, technicianStats]);

  // ========== NEW: TECHNICIAN-MACHINE CORRELATION ==========
  const technicianPerformanceCorrelation = useMemo<TechnicianPerformanceCorrelation[]>(() => {
    if (!filteredWorkOrders || !technicianStats.length) return [];

    return technicianStats.map(tech => {
      // Get all work orders for this technician
      const techWorkOrders = filteredWorkOrders.filter(wo => {
        const techName = wo.customColumns?.staffFirstName && wo.customColumns?.staffLastName
          ? `${wo.customColumns.staffFirstName} ${wo.customColumns.staffLastName}`.trim()
          : wo.assignee?.trim();
        return techName === tech.name;
      });

      // Count unique machines serviced
      const uniqueMachines = new Set(
        techWorkOrders.map(wo => wo.assetId || wo.customColumns?.machine).filter(Boolean)
      );

      // Calculate preventive vs corrective ratio
      const preventiveCount = techWorkOrders.filter(wo => 
        wo.type?.toLowerCase().includes('preventive') || wo.type?.toLowerCase().includes('préventive')
      ).length;

      const preventiveRatio = techWorkOrders.length > 0 
        ? (preventiveCount / techWorkOrders.length) * 100 
        : 0;

      // Calculate repeat failure rate (failures within 30 days of same machine)
      let repeatFailures = 0;
      const machineLastRepair: Record<string, Date> = {};

      techWorkOrders
        .sort((a, b) => {
          const dateA = a.endAt || a.startAt || a.createdAt;
          const dateB = b.endAt || b.startAt || b.createdAt;
          return (dateA ? new Date(dateA).getTime() : 0) - (dateB ? new Date(dateB).getTime() : 0);
        })
        .forEach(wo => {
          const machine = wo.assetId || wo.customColumns?.machine;
          const repairDate = wo.endAt || wo.startAt;

          if (machine && repairDate) {
            const date = new Date(repairDate);
            if (machineLastRepair[machine]) {
              const daysSince = (date.getTime() - machineLastRepair[machine].getTime()) / (1000 * 60 * 60 * 24);
              if (daysSince <= 30) {
                repeatFailures += 1;
              }
            }
            machineLastRepair[machine] = date;
          }
        });

      const repeatFailureRate = techWorkOrders.length > 0
        ? (repeatFailures / techWorkOrders.length) * 100
        : 0;

      // Quality score (inverse of repeat failures + success rate)
      const qualityScore = Math.max(0, tech.successRate - repeatFailureRate);

      return {
        technicianName: tech.name,
        machinesServiced: uniqueMachines.size,
        avgSuccessRate: tech.successRate,
        preventiveImpact: Math.round(preventiveRatio),
        qualityScore: Math.round(qualityScore),
        repeatFailureRate: Math.round(repeatFailureRate * 10) / 10,
      };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);
  }, [filteredWorkOrders, technicianStats]);

  // Filter technicians
  const filteredTechnicians = useMemo(() => {
    return technicianStats.filter((tech) => {
      const matchesSearch = tech.name.toLowerCase().includes(technicianSearch.toLowerCase());
      const matchesFilter =
        technicianFilter === 'all' ||
        (technicianFilter === 'experts' && tech.rating >= 4) ||
        (technicianFilter === 'at-risk' && tech.isAtRisk);
      return matchesSearch && matchesFilter;
    });
  }, [technicianStats, technicianSearch, technicianFilter]);

  // Filter machines
  const filteredMachines = useMemo(() => {
    return machineInsights.filter((machine) => {
      if (machineRiskFilter === 'all') return true;
      if (machineRiskFilter === 'critical') return machine.riskScore >= 75;
      if (machineRiskFilter === 'high') return machine.riskScore >= 50 && machine.riskScore < 75;
      if (machineRiskFilter === 'medium') return machine.riskScore >= 25 && machine.riskScore < 50;
      if (machineRiskFilter === 'low') return machine.riskScore < 25;
      return true;
    });
  }, [machineInsights, machineRiskFilter]);

  // Summary statistics
  const summaryStats = useMemo(() => {
    const totalTechnicians = technicianStats.length;
    const avgSuccessRate = technicianStats.length > 0
      ? Math.round(technicianStats.reduce((sum, t) => sum + t.successRate, 0) / technicianStats.length)
      : 0;
    const totalRepairs = technicianStats.reduce((sum, t) => sum + t.totalRepairs, 0);
    const totalSpend = machineInsights.reduce((sum, m) => sum + m.totalCost, 0);
    const criticalMachines = machineInsights.filter((m) => m.riskScore >= 75).length;

    return {
      totalTechnicians,
      avgSuccessRate,
      totalRepairs,
      totalSpend,
      criticalMachines,
    };
  }, [technicianStats, machineInsights]);

  // Top performers chart data
  const topPerformersData = useMemo(() => {
    return technicianStats.slice(0, 5).map((tech) => ({
      name: tech.name.split(' ')[0], // First name only for chart
      rating: tech.rating,
      repairs: tech.completedRepairs,
    }));
  }, [technicianStats]);

  // Risk distribution data
  const riskDistributionData = useMemo(() => {
    const critical = machineInsights.filter((m) => m.riskScore >= 75).length;
    const high = machineInsights.filter((m) => m.riskScore >= 50 && m.riskScore < 75).length;
    const medium = machineInsights.filter((m) => m.riskScore >= 25 && m.riskScore < 50).length;
    const low = machineInsights.filter((m) => m.riskScore < 25).length;

    return [
      { name: 'Critical', value: critical, color: '#EF4444' },
      { name: 'High', value: high, color: '#F59E0B' },
      { name: 'Medium', value: medium, color: '#3B82F6' },
      { name: 'Low', value: low, color: '#10B981' },
    ];
  }, [machineInsights]);

  return (
    <PageBody>
      <div className="container mx-auto py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Insights & Analytics
            </h1>
            <p className="text-muted-foreground mt-2">
              Analyse approfondie des techniciens et prédictions de maintenance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1">
              <Activity className="h-4 w-4 mr-1" />
              {workOrders?.length || 0} Work Orders
            </Badge>
            <Badge variant="outline" className="px-3 py-1">
              <Package className="h-4 w-4 mr-1" />
              {assets?.length || 0} Assets
            </Badge>
          </div>
        </div>

        {/* Month Filter */}
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                  Filtrer par période:
                </span>
              </div>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Sélectionner un mois" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les périodes</SelectItem>
                  {availableMonths.map((month) => {
                    const [year, monthNum] = month.split('-');
                    const date = new Date(parseInt(year), parseInt(monthNum) - 1);
                    const monthName = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                    return (
                      <SelectItem key={month} value={month}>
                        {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedMonth !== 'all' && (
                <Badge variant="secondary" className="ml-2">
                  {filteredWorkOrders?.length || 0} interventions ce mois
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Data Quality Info Banner */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Brain className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  📊 Calcul optimisé des heures de travail
                </p>
                <p className="text-blue-700 dark:text-blue-300">
                  Les heures sont calculées depuis les <strong>dates réelles</strong> d'intervention (limitées à 8h max/intervention pour éviter les cumuls). 
                  Estimations conservatrices : 1.5h (terminé), 1h (en cours), 0.5h (planifié). 
                  <strong>💡 Astuce :</strong> Utilisez le filtre par mois ci-dessus pour voir des périodes plus courtes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Technicians</CardTitle>
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">{summaryStats.totalTechnicians}</div>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Active team members</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">Avg Success Rate</CardTitle>
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-900 dark:text-green-100">{summaryStats.avgSuccessRate}%</div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">Team quality benchmark</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">Total Repairs</CardTitle>
              <Wrench className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">{summaryStats.totalRepairs}</div>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">All-time volume</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">Total Spend</CardTitle>
              <DollarSign className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">€{summaryStats.totalSpend.toLocaleString()}</div>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Maintenance budget</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-red-700 dark:text-red-300">At-Risk Machines</CardTitle>
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-900 dark:text-red-100">{summaryStats.criticalMachines}</div>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">Need immediate action</p>
            </CardContent>
          </Card>
        </div>

        {/* ========== NEW: ADVANCED ANALYTICS SECTION ========== */}
        {showAdvancedAnalytics && (
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950 border-2 border-indigo-200 dark:border-indigo-800">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Brain className="h-6 w-6 text-indigo-600" />
                    Analyses Intelligentes Avancées
                  </CardTitle>
                  <CardDescription className="mt-2">
                    Détection de gaps, prédictions de surcharge, et corrélations de performance
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdvancedAnalytics(!showAdvancedAnalytics)}
                >
                  Masquer
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* SKILL GAP ANALYSIS */}
              {skillGapAnalysis.length > 0 && (
                <Card className="border-2 border-orange-200 dark:border-orange-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-orange-600" />
                      🎓 Détection de Compétences Manquantes
                    </CardTitle>
                    <CardDescription>
                      Identification des gaps de compétences impactant la réactivité
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {skillGapAnalysis.map((gap, idx) => (
                        <div
                          key={gap.skill}
                          className="p-4 rounded-lg bg-white dark:bg-gray-900 border-2 border-orange-200 dark:border-orange-800"
                        >
                          <div className="flex items-start justify-between flex-wrap gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="destructive" className="text-sm">
                                  Gap #{idx + 1}
                                </Badge>
                                <h3 className="font-bold text-lg">{gap.skill}</h3>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                <div>
                                  <div className="text-xs text-muted-foreground">Demande</div>
                                  <div className="text-xl font-bold text-orange-600">{gap.demandCount}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Techniciens qualifiés</div>
                                  <div className="text-xl font-bold text-blue-600">{gap.qualifiedTechnicians}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Interventions retardées</div>
                                  <div className="text-xl font-bold text-red-600">{gap.impactedInterventions}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Délai moyen</div>
                                  <div className="text-xl font-bold text-purple-600">{gap.avgDelay}j</div>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950 border-yellow-400 text-yellow-700 dark:text-yellow-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Action requise
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-start gap-2">
                              <Lightbulb className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                  Recommandation:
                                </p>
                                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                                  Former {Math.ceil(gap.gap / 10)} technicien(s) sur <strong>{gap.skill}</strong> pour
                                  réduire le délai moyen de {gap.avgDelay}j à &lt;1j et éliminer les retards sur {gap.impactedInterventions} interventions.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {skillGapAnalysis.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                        <p>✅ Aucun gap de compétences critique détecté</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* WORKLOAD ALERTS */}
              {workloadAlerts.length > 0 && (
                <Card className="border-2 border-red-200 dark:border-red-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserX className="h-5 w-5 text-red-600" />
                      ⚠️ Alertes de Surcharge (7 prochains jours)
                    </CardTitle>
                    <CardDescription>
                      Prédiction de capacité et recommandations d'optimisation
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {workloadAlerts.map((alert) => {
                        const statusConfig = {
                          overloaded: {
                            color: 'bg-red-500',
                            textColor: 'text-red-700 dark:text-red-300',
                            bgColor: 'bg-red-50 dark:bg-red-950',
                            borderColor: 'border-red-300 dark:border-red-700',
                            icon: <AlertTriangle className="h-5 w-5 text-red-600" />,
                          },
                          underutilized: {
                            color: 'bg-blue-500',
                            textColor: 'text-blue-700 dark:text-blue-300',
                            bgColor: 'bg-blue-50 dark:bg-blue-950',
                            borderColor: 'border-blue-300 dark:border-blue-700',
                            icon: <TrendDown className="h-5 w-5 text-blue-600" />,
                          },
                          optimal: {
                            color: 'bg-green-500',
                            textColor: 'text-green-700 dark:text-green-300',
                            bgColor: 'bg-green-50 dark:bg-green-950',
                            borderColor: 'border-green-300 dark:border-green-700',
                            icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
                          },
                        };

                        const config = statusConfig[alert.status];

                        return (
                          <div
                            key={alert.technicianName}
                            className={`p-4 rounded-lg border-2 ${config.bgColor} ${config.borderColor}`}
                          >
                            <div className="flex items-start justify-between flex-wrap gap-4">
                              <div className="flex items-center gap-3">
                                {config.icon}
                                <div>
                                  <h3 className="font-bold text-lg">{alert.technicianName}</h3>
                                  <div className="flex items-center gap-3 mt-2">
                                    <Badge className={`${config.color} text-white`}>
                                      {alert.capacityPercent}% capacité
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">
                                      {alert.weeklyHours}h / 40h semaine
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                <div className="text-right">
                                  <div className="text-sm font-medium text-muted-foreground mb-1">
                                    Progression
                                  </div>
                                  <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                                    <div
                                      className={`h-3 rounded-full ${config.color} transition-all duration-500`}
                                      style={{ width: `${Math.min(alert.capacityPercent, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 p-3 bg-white dark:bg-gray-900 rounded-lg border">
                              <div className="flex items-start gap-2">
                                <Briefcase className="h-4 w-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm font-medium">{alert.recommendation}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* TECHNICIAN-MACHINE CORRELATION */}
              {technicianPerformanceCorrelation.length > 0 && (
                <Card className="border-2 border-green-200 dark:border-green-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5 text-green-600" />
                      📊 Corrélation Pannes-Techniciens
                    </CardTitle>
                    <CardDescription>
                      Impact des interventions préventives et qualité de réparation
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-gray-300 dark:border-gray-700">
                            <th className="text-left py-3 px-2 font-semibold">Technicien</th>
                            <th className="text-center py-3 px-2 font-semibold">Machines</th>
                            <th className="text-center py-3 px-2 font-semibold">Taux succès</th>
                            <th className="text-center py-3 px-2 font-semibold">% Préventif</th>
                            <th className="text-center py-3 px-2 font-semibold">Score qualité</th>
                            <th className="text-center py-3 px-2 font-semibold">Pannes répétées</th>
                            <th className="text-center py-3 px-2 font-semibold">Impact</th>
                          </tr>
                        </thead>
                        <tbody>
                          {technicianPerformanceCorrelation.slice(0, 10).map((corr, idx) => {
                            const isTopPerformer = corr.qualityScore >= 85;
                            const hasLowRepeatRate = corr.repeatFailureRate < 5;
                            const preventiveLeader = corr.preventiveImpact >= 40;

                            return (
                              <tr
                                key={corr.technicianName}
                                className={`border-b hover:bg-gray-50 dark:hover:bg-gray-900 ${
                                  isTopPerformer ? 'bg-green-50 dark:bg-green-950' : ''
                                }`}
                              >
                                <td className="py-3 px-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{corr.technicianName}</span>
                                    {isTopPerformer && (
                                      <Award className="h-4 w-4 text-yellow-500" />
                                    )}
                                  </div>
                                </td>
                                <td className="text-center py-3 px-2">
                                  <Badge variant="outline">{corr.machinesServiced}</Badge>
                                </td>
                                <td className="text-center py-3 px-2">
                                  <Badge
                                    variant={corr.avgSuccessRate >= 80 ? 'default' : 'secondary'}
                                    className={
                                      corr.avgSuccessRate >= 80
                                        ? 'bg-green-500'
                                        : 'bg-gray-400'
                                    }
                                  >
                                    {corr.avgSuccessRate}%
                                  </Badge>
                                </td>
                                <td className="text-center py-3 px-2">
                                  <div className="flex flex-col items-center">
                                    <span className="font-semibold text-blue-600">
                                      {corr.preventiveImpact}%
                                    </span>
                                    {preventiveLeader && (
                                      <Shield className="h-3 w-3 text-green-600 mt-1" />
                                    )}
                                  </div>
                                </td>
                                <td className="text-center py-3 px-2">
                                  <Badge
                                    className={
                                      corr.qualityScore >= 85
                                        ? 'bg-green-600 text-white'
                                        : corr.qualityScore >= 70
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-orange-600 text-white'
                                    }
                                  >
                                    {corr.qualityScore}
                                  </Badge>
                                </td>
                                <td className="text-center py-3 px-2">
                                  <span
                                    className={`font-semibold ${
                                      corr.repeatFailureRate > 10
                                        ? 'text-red-600'
                                        : corr.repeatFailureRate > 5
                                        ? 'text-orange-600'
                                        : 'text-green-600'
                                    }`}
                                  >
                                    {corr.repeatFailureRate}%
                                  </span>
                                </td>
                                <td className="text-center py-3 px-2">
                                  {hasLowRepeatRate && preventiveLeader ? (
                                    <Badge className="bg-green-600 text-white">
                                      ⭐ Excellent
                                    </Badge>
                                  ) : corr.repeatFailureRate > 10 ? (
                                    <Badge variant="destructive">⚠️ À améliorer</Badge>
                                  ) : (
                                    <Badge variant="secondary">✓ Bon</Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start gap-2">
                        <Brain className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                            💡 Insights clés:
                          </p>
                          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                            {technicianPerformanceCorrelation.filter(c => c.preventiveImpact >= 40).length > 0 && (
                              <li>
                                • <strong>{technicianPerformanceCorrelation.filter(c => c.preventiveImpact >= 40).length} techniciens</strong> excellent
                                sur le préventif (&gt;40%) → Moins de pannes correctives
                              </li>
                            )}
                            {technicianPerformanceCorrelation.filter(c => c.repeatFailureRate < 5).length > 0 && (
                              <li>
                                • <strong>{technicianPerformanceCorrelation.filter(c => c.repeatFailureRate < 5).length} techniciens</strong> avec
                                &lt;5% pannes répétées → Qualité de réparation élevée
                              </li>
                            )}
                            {technicianPerformanceCorrelation.filter(c => c.repeatFailureRate > 10).length > 0 && (
                              <li className="text-orange-700 dark:text-orange-300">
                                • ⚠️ <strong>{technicianPerformanceCorrelation.filter(c => c.repeatFailureRate > 10).length} techniciens</strong> avec
                                &gt;10% pannes répétées → Formation/supervision recommandée
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Empty State for Advanced Analytics */}
              {skillGapAnalysis.length === 0 && 
               workloadAlerts.length === 0 && 
               technicianPerformanceCorrelation.length === 0 && (
                <div className="text-center py-12">
                  <Brain className="h-16 w-16 mx-auto mb-4 text-indigo-400 opacity-50" />
                  <p className="text-muted-foreground text-lg">
                    Données insuffisantes pour les analyses avancées
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Importez plus de work orders pour activer ces insights
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Toggle Button for Advanced Analytics (if hidden) */}
        {!showAdvancedAnalytics && (
          <Card className="border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/50">
            <CardContent className="p-6 text-center">
              <Button
                variant="default"
                size="lg"
                onClick={() => setShowAdvancedAnalytics(true)}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              >
                <Brain className="h-5 w-5 mr-2" />
                Afficher les Analyses Intelligentes Avancées
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                Détection de gaps, alertes de surcharge, corrélations de performance
              </p>
            </CardContent>
          </Card>
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Performers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                Top Performers
              </CardTitle>
              <CardDescription>Highest rated technicians by overall performance</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topPerformersData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 5]} />
                  <Tooltip />
                  <Bar dataKey="rating" fill="#3B82F6" name="Rating (0-5)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Risk Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-indigo-500" />
                Machine Risk Distribution
              </CardTitle>
              <CardDescription>Breakdown of machines by risk level</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RePieChart>
                  <Pie
                    data={riskDistributionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {riskDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RePieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Technician Analytics Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Users className="h-6 w-6 text-blue-500" />
                  Technician Analytics
                </CardTitle>
                <CardDescription className="mt-2">
                  Performance metrics, specializations, and training recommendations
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search technician..."
                    value={technicianSearch}
                    onChange={(e) => setTechnicianSearch(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                  <SelectTrigger className="w-40">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="experts">Experts (4+)</SelectItem>
                    <SelectItem value="at-risk">At-Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredTechnicians.map((tech) => (
                <Card key={tech.name} className="border-2 hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
                          {tech.name}
                          {tech.isAtRisk && (
                            <Badge variant="destructive" className="ml-2">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              At Risk
                            </Badge>
                          )}
                          {tech.rating >= 4 && (
                            <Badge variant="default" className="ml-2 bg-yellow-500">
                              <Award className="h-3 w-3 mr-1" />
                              Expert
                            </Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-1 mt-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-5 w-5 ${
                                i < Math.floor(tech.rating)
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : i < tech.rating
                                  ? 'fill-yellow-400 text-yellow-400 opacity-50'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                          <span className="ml-2 text-sm font-semibold text-muted-foreground">
                            {tech.rating}/5
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Repairs</div>
                        <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{tech.totalRepairs}</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                        <div className="text-xs text-green-600 dark:text-green-400 font-medium">Success Rate</div>
                        <div className="text-2xl font-bold text-green-900 dark:text-green-100">{tech.successRate}%</div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-lg">
                        <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">Avg Time</div>
                        <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">{tech.avgRepairTime}h</div>
                      </div>
                      <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded-lg relative">
                        <div className="text-xs text-orange-600 dark:text-orange-400 font-medium flex items-center gap-1">
                          Total Hours
                          <span className="text-[10px] opacity-70">
                            ({tech.totalRepairs > 0 ? (tech.totalHours / tech.totalRepairs).toFixed(1) : '0'}h/int)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">{tech.totalHours}h</div>
                          {tech.totalHours > 200 && (
                            <Badge variant="destructive" className="text-xs">
                              Élevé
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Data Quality Warning */}
                    {tech.totalHours > 200 && (
                      <div className="p-2 bg-yellow-50 dark:bg-yellow-950 rounded border border-yellow-200 dark:border-yellow-800">
                        <p className="text-xs text-yellow-700 dark:text-yellow-300 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Période avec beaucoup d'interventions - Utilisez le filtre par mois pour plus de détails
                        </p>
                      </div>
                    )}

                    {/* Specializations */}
                    {tech.specializations.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Tool className="h-4 w-4 text-indigo-500" />
                          Top Specializations
                        </div>
                        <div className="space-y-2">
                          {tech.specializations.map((spec) => (
                            <div key={spec.type} className="flex items-center justify-between text-sm">
                              <span className="font-medium truncate mr-2">{spec.type}</span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="outline" className="text-xs">
                                  {spec.count} repairs
                                </Badge>
                                <Badge
                                  variant={spec.successRate >= 80 ? 'default' : spec.successRate >= 60 ? 'secondary' : 'destructive'}
                                  className="text-xs"
                                >
                                  {spec.successRate}% success
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Training Needs */}
                    {tech.trainingNeeds.length > 0 && (
                      <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                        <div className="text-sm font-semibold mb-2 text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          Training Recommended
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {tech.trainingNeeds.map((need) => (
                            <Badge key={need} variant="outline" className="text-xs border-yellow-400 text-yellow-700 dark:text-yellow-300">
                              {need}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent Activity */}
                    <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>Last 30 days:</span>
                      </div>
                      <Badge variant="secondary">
                        {tech.recentActivity} repairs
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredTechnicians.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No technicians found matching your criteria</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Machine Insights Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Activity className="h-6 w-6 text-red-500" />
                  Machine Health & Predictions
                </CardTitle>
                <CardDescription className="mt-2">
                  Risk analysis, failure predictions, and maintenance recommendations
                </CardDescription>
              </div>
              <Select value={machineRiskFilter} onValueChange={setMachineRiskFilter}>
                <SelectTrigger className="w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Machines</SelectItem>
                  <SelectItem value="critical">Critical (75+)</SelectItem>
                  <SelectItem value="high">High (50-75)</SelectItem>
                  <SelectItem value="medium">Medium (25-50)</SelectItem>
                  <SelectItem value="low">Low (0-25)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {filteredMachines.map((machine) => {
                const riskLevel =
                  machine.riskScore >= 75
                    ? { label: 'Critical', color: 'bg-red-500', textColor: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-50 dark:bg-red-950' }
                    : machine.riskScore >= 50
                    ? { label: 'High', color: 'bg-orange-500', textColor: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-50 dark:bg-orange-950' }
                    : machine.riskScore >= 25
                    ? { label: 'Medium', color: 'bg-blue-500', textColor: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-50 dark:bg-blue-950' }
                    : { label: 'Low', color: 'bg-green-500', textColor: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-50 dark:bg-green-950' };

                const maintenanceIcon =
                  machine.maintenanceType === 'preventive' ? (
                    <Shield className="h-4 w-4 text-green-600" />
                  ) : machine.maintenanceType === 'corrective' ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Zap className="h-4 w-4 text-orange-600" />
                  );

                return (
                  <Card key={machine.machineId} className={`border-2 ${riskLevel.bgColor}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
                            {machine.machineName}
                            <Badge variant="outline" className="ml-2">
                              Criticality: {machine.criticality}
                            </Badge>
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge className={`${riskLevel.color} text-white`}>
                              Risk: {machine.riskScore}/100
                            </Badge>
                            <Badge variant="outline" className="flex items-center gap-1">
                              {maintenanceIcon}
                              {machine.maintenanceType.charAt(0).toUpperCase() + machine.maintenanceType.slice(1)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Key Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border">
                          <div className="text-xs text-muted-foreground font-medium">Failures</div>
                          <div className="text-2xl font-bold">{machine.failureCount}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border">
                          <div className="text-xs text-muted-foreground font-medium">Avg Downtime</div>
                          <div className="text-2xl font-bold">{machine.avgDowntime}m</div>
                        </div>
                        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border">
                          <div className="text-xs text-muted-foreground font-medium">Total Cost</div>
                          <div className="text-2xl font-bold">€{machine.totalCost.toLocaleString()}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border">
                          <div className="text-xs text-muted-foreground font-medium">Avg Interval</div>
                          <div className="text-2xl font-bold">{machine.avgInterval}d</div>
                        </div>
                      </div>

                      {/* AI Prediction */}
                      <div className={`p-4 rounded-lg border-2 ${
                        machine.nextFailureProbability >= 70 
                          ? 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-800' 
                          : machine.nextFailureProbability >= 40
                          ? 'bg-orange-50 dark:bg-orange-950 border-orange-300 dark:border-orange-800'
                          : 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-800'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Brain className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                          <span className="font-semibold text-lg">AI Prediction</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-muted-foreground">Next Failure</div>
                            <div className="text-3xl font-bold">
                              {machine.daysUntilNextFailure} days
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Probability</div>
                            <div className="text-3xl font-bold">
                              {machine.nextFailureProbability}%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Recommendations */}
                      {machine.recommendations.length > 0 && (
                        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-indigo-500" />
                            Recommendations
                          </div>
                          <ul className="space-y-2">
                            {machine.recommendations.map((rec, idx) => (
                              <li key={idx} className="text-sm flex items-start gap-2">
                                <span className="text-indigo-500 mt-0.5">•</span>
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Failure Types */}
                      {machine.failureTypes.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-purple-500" />
                            Failure Type Breakdown
                          </div>
                          <div className="space-y-2">
                            {machine.failureTypes.slice(0, 5).map((ft, idx) => {
                              const percentage = (ft.count / machine.failureCount) * 100;
                              return (
                                <div key={ft.type}>
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="font-medium truncate mr-2">{ft.type}</span>
                                    <span className="text-muted-foreground flex-shrink-0">{ft.count} ({percentage.toFixed(1)}%)</span>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div
                                      className="h-2 rounded-full"
                                      style={{
                                        width: `${percentage}%`,
                                        backgroundColor: COLORS[idx % COLORS.length],
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {filteredMachines.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No machines found matching your criteria</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
