# 🧠 Insights & Analytics - Complete Documentation

## Overview

The **Insights & Analytics** page is a powerful business intelligence tool that provides:

1. **Technician Performance Analytics** - Deep insights into technician capabilities and performance
2. **Machine Health Intelligence** - Real-time machine risk assessment
3. **Predictive Maintenance AI** - ML-powered predictions of when machines will fail

---

## 📊 Technician Analytics

### What You See

Each technician card displays:

#### **Overall Rating (0-5 stars)**
- Based on: Success rate (60%), Speed (20%), Cost efficiency (20%)
- **Formula**: `(success% * 0.6) + (speed_score * 0.2) + (efficiency_score * 0.2) / 100 * 5`
- Star rating helps quickly identify top performers

#### **Key Metrics**

| Metric | What It Means | Why It Matters |
|--------|---------------|----------------|
| **Total Repairs** | Number of completed interventions | Shows experience level |
| **Success Rate** | % of repairs completed successfully (first-time fix) | Quality indicator |
| **Avg Repair Time** | Average hours per repair | Efficiency indicator |
| **Avg Cost** | Average cost per repair | Resource effectiveness |

#### **Specializations**
- Shows top 3 problem types the technician handles best
- Displays success rate per specialization
- Example: "Hydraulique: 94% success (156 repairs)"

#### **Training Recommendations**
- Auto-detected based on performance gaps
- Shows if technician's success rate is below 70%
- Identifies specific areas needing improvement

#### **Recent Activity**
- Number of repairs in last 30 days
- Helps identify active vs. inactive technicians

#### **⚠️ At Risk Badge**
- Appears when success rate drops below 70% AND technician has >3 recent repairs
- Indicates need for support/retraining

### Filters Available

- **All Technicians** - Show everyone
- **Experts (4+ rating)** - Top performers
- **At Risk** - Those needing support

### Use Cases

✅ **Assign critical repairs** to highest-rated technicians
✅ **Identify training needs** for team development
✅ **Benchmark performance** across team
✅ **Detect bottlenecks** when one tech is overloaded
✅ **Plan succession** - know who can replace whom

---

## 🏭 Machine Insights & Predictions

### What You See

Each machine card displays:

#### **Risk Level Badge**
```
🔴 Critical (75+):  Immediate action needed
🟠 High (50-75):    Monitor closely
🟡 Medium (25-50):  Plan interventions
🟢 Low (0-25):      All good, routine maintenance
```

#### **Risk Score (0-100)**
Calculated from:
- Failure frequency (30%)
- Downtime per failure (25%)
- Total maintenance cost (25%)
- Prediction score (20%)

#### **Maintenance Type Classification**
- **🛡️ Preventive** - Scheduled maintenance working well
- **🚨 Corrective** - Mostly reactive/emergency repairs
- **⚙️ Mixed** - Combination of both

**How we determine it:**
- Analyze last 6 months of repairs
- If >70% scheduled = Preventive
- If <30% scheduled = Corrective
- Otherwise = Mixed

#### **Key Metrics**

| Metric | What It Means | Calculation |
|--------|---------------|-------------|
| **Failure Frequency** | Repairs per month | Total repairs ÷ months of data |
| **Avg Downtime** | Hours lost per failure | Total downtime ÷ number of failures |
| **Total Cost** | Total maintenance spent | Sum of all repair costs |
| **Failure Types** | Which problems appear most | Bar chart showing distribution |

---

## 🔮 AI Maintenance Prediction

### How It Works

The prediction algorithm analyzes historical failure patterns to predict:
1. **When the next failure will likely occur**
2. **Probability of failure in the next 30 days**
3. **Whether machine should be preventive or corrective**

### The Algorithm

#### **Step 1: Calculate Failure Intervals**
```
Failure 1: Jan 5    ──────┐
Failure 2: Feb 2    ──────┼ 28 days apart
                           │
Failure 3: Mar 8    ──────┼ 34 days apart
                           │
Failure 4: Mar 25   ──────┘ 17 days apart

Average interval = (28 + 34 + 17) / 3 = 26.3 days
```

#### **Step 2: Calculate Variability (Std Dev)**
```
How much do intervals vary?
- If all failures are 25 days apart → Low variance → Predictable
- If failures are 10-50 days apart → High variance → Less predictable
```

#### **Step 3: Calculate Days Until Next Failure**
```
Days until next failure = Average interval - Days since last failure

Example:
- Average interval: 26 days
- Days since last failure: 18 days
- Days until next failure: 26 - 18 = 8 days
```

#### **Step 4: Calculate Probability**
```
Uses a normal distribution (bell curve) to estimate:
- If machine is 15 days away from average failure time → ~50% probability
- If machine is at the average failure time → ~80% probability
- If machine is 5 days past average time → ~95% probability
```

### Example Prediction

```
Machine: CNC-LATHE-01

Historical Data:
- 12 failures over 6 months
- Average interval: 15 days
- Std Dev: ±4 days

Current Status:
- Days since last failure: 14 days
- Predicted next failure: 1 day from now
- Probability: 78%

Recommendation:
⚠️ HIGH RISK: This machine will likely fail within 24 hours.
Schedule immediate preventive maintenance or have repair team on standby.
```

---

## 📈 Maintenance Type Analysis

### How We Determine Preventive vs Corrective

```
PREVENTIVE PATTERN:
✅ Machine 1: Scheduled repairs every 30 days
  └─ Status: Preventive (healthy pattern)
  └─ Cost: Lower (planned parts + labor)
  └─ Downtime: Scheduled (minimal business impact)

CORRECTIVE PATTERN:
❌ Machine 2: Emergency repairs every 20 days
  └─ Status: Corrective (reactive pattern)
  └─ Cost: Higher (emergency dispatch + premium labor)
  └─ Downtime: Unscheduled (high business impact)

MIXED PATTERN:
⚙️ Machine 3: Mix of scheduled + emergency
  └─ Status: Mixed (opportunity to improve)
  └─ Action: Shift toward preventive maintenance
```

### Recommendations by Type

**If Preventive:**
```
✅ "Current preventive approach working well. 
    Continue scheduled maintenance every 25 days."
```

**If Corrective:**
```
⚠️ "Switch to preventive maintenance. This machine is failing 
    reactively (1.2/month). Implementing scheduled PM could 
    reduce failures by 40-60%."
```

**If Mixed:**
```
⚙️ "Mixed maintenance pattern. Consider increasing 
    preventive frequency to reduce emergency repairs."
```

---

## 💡 Use Cases & Business Value

### For Maintenance Managers

✅ **Predict failures before they happen**
- Avoid unexpected downtime
- Schedule maintenance during production gaps
- Reduce emergency costs

✅ **Optimize technician allocation**
- Assign right person for the job
- Identify overloaded technicians
- Plan coverage

✅ **Budget planning**
- Forecast maintenance costs
- Justify preventive investments
- ROI calculations

### For Plant Managers

✅ **Production planning**
- Know which machines are at risk
- Schedule production around maintenance windows
- Reduce unplanned downtime

✅ **Cost analysis**
- See true cost of corrective vs preventive
- Identify chronic problem machines
- Make upgrade/replacement decisions

### For Team Leaders

✅ **Performance management**
- Objective technician ratings
- Training need identification
- Career development tracking

✅ **Resource optimization**
- Workload balancing
- Skill utilization
- Team capacity planning

---

## 🎯 Key Performance Indicators (KPIs)

### Summary Statistics

1. **Total Technicians** - Team size
2. **Average Success Rate** - Team quality (should target >85%)
3. **Total Repairs** - Volume of work
4. **Total Spend** - Budget tracking
5. **At-Risk Machines** - Critical count (should be 0-2)

### Benchmarks to Aim For

| KPI | Target | Current | Status |
|-----|--------|---------|--------|
| Team Success Rate | >85% | [Your Data] | ✅/❌ |
| Avg Repair Time | <2h | [Your Data] | ✅/❌ |
| Preventive % | >70% | [Your Data] | ✅/❌ |
| Critical Machines | <2 | [Your Data] | ✅/❌ |
| Tech At-Risk | <1 | [Your Data] | ✅/❌ |

---

## 📊 Data Sources

All insights are calculated from your existing data:

| Data Source | Used For |
|-------------|----------|
| **Workload.csv** | Technician performance, repair times, costs |
| **AMDEC.csv** | Failure types, machine issues, interventions |
| **GMAO_Integrator.csv** | Maintenance history, downtime tracking |
| **Dispo_MTBF_MTTR.xlsx** | MTBF baseline, expected intervals |

---

## 🔄 How Predictions Are Updated

- **Real-time**: Predictions update instantly as new repairs are logged
- **Historical**: Uses last 6 months of data for accuracy
- **Adaptive**: Algorithm adjusts as new patterns emerge

---

## ⚠️ Important Limitations

1. **Data quality matters** - Predictions depend on accurate data logging
2. **Seasonal patterns** - Some machines have seasonal variations not captured
3. **External factors** - Doesn't account for environmental changes
4. **Small sample** - Need minimum 5 failures for reliable predictions
5. **Assumption**: Current conditions continue (no major changes)

---

## 🚀 How to Use This Effectively

### Weekly Checklist
- [ ] Review critical risk machines
- [ ] Check technician workload distribution
- [ ] Identify at-risk technicians
- [ ] Schedule preventive maintenance for high-risk assets

### Monthly Review
- [ ] Analyze trend in success rates
- [ ] Identify which technicians improved/declined
- [ ] Plan training interventions
- [ ] Budget forecasting

### Quarterly Assessment
- [ ] Review preventive vs corrective ratio
- [ ] Identify chronic problem machines
- [ ] Evaluate technician specialization growth
- [ ] Plan major interventions

---

## 💬 Questions & Support

**Q: Why is Machine X showing as Critical?**
A: It has high failure frequency, long downtime, or both combined. Check the recommendation for next steps.

**Q: Can I trust the next-failure prediction?**
A: It's most accurate when you have 6+ months of data. Confidence increases with more data points.

**Q: What if a technician's rating dropped suddenly?**
A: Check if they had several unsuccessful repairs recently. May indicate a difficult job or need for support.

**Q: How do I improve the success rate?**
A: Assign experts to complex jobs, increase technician training, or better diagnostic procedures.

---

**Last Updated**: December 10, 2025
**Version**: 1.0
**Status**: Production Ready ✅
