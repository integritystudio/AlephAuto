/**
 * Accuracy Metrics Calculator
 *
 * Calculates precision, recall, F1 score, and false positive rate
 * for duplicate detection results.
 */

/**
 * Calculate precision: TP / (TP + FP)
 * Measures how many detected duplicates are actually duplicates
 *
 * @param {number} truePositives - Correctly detected duplicates
 * @param {number} falsePositives - Incorrectly detected duplicates
 * @returns {number} Precision score (0-1)
 */
export function calculatePrecision(truePositives, falsePositives) {
  const total = truePositives + falsePositives;
  if (total === 0) return 0;
  return truePositives / total;
}

/**
 * Calculate recall: TP / (TP + FN)
 * Measures how many actual duplicates were detected
 *
 * @param {number} truePositives - Correctly detected duplicates
 * @param {number} falseNegatives - Missed duplicates
 * @returns {number} Recall score (0-1)
 */
export function calculateRecall(truePositives, falseNegatives) {
  const total = truePositives + falseNegatives;
  if (total === 0) return 0;
  return truePositives / total;
}

/**
 * Calculate F1 score: 2 * (precision * recall) / (precision + recall)
 * Harmonic mean of precision and recall
 *
 * @param {number} precision - Precision score
 * @param {number} recall - Recall score
 * @returns {number} F1 score (0-1)
 */
export function calculateF1Score(precision, recall) {
  if (precision + recall === 0) return 0;
  return 2 * (precision * recall) / (precision + recall);
}

/**
 * Calculate false positive rate: FP / (FP + TN)
 * Measures how often non-duplicates are incorrectly marked as duplicates
 *
 * @param {number} falsePositives - Incorrectly detected duplicates
 * @param {number} trueNegatives - Correctly identified non-duplicates
 * @returns {number} False positive rate (0-1)
 */
export function calculateFalsePositiveRate(falsePositives, trueNegatives) {
  const total = falsePositives + trueNegatives;
  if (total === 0) return 0;
  return falsePositives / total;
}

/**
 * Build lookup maps for expected and detected groups
 *
 * @param {Array} expectedGroups - Expected groups from ground truth
 * @param {Array} detectedGroups - Groups detected by scanner
 * @returns {Object} Maps for expected and detected lookups
 */
function buildLookupMaps(expectedGroups, detectedGroups) {
  const expectedMap = new Map();
  expectedGroups.forEach(group => {
    group.members.forEach(member => {
      const key = `${member.file}:${member.function}`;
      if (!expectedMap.has(key)) {
        expectedMap.set(key, []);
      }
      expectedMap.get(key).push(group.group_id);
    });
  });

  const detectedMap = new Map();
  detectedGroups.forEach(group => {
    group.member_block_ids?.forEach(blockId => {
      const block = group._blocks?.find(b => b.block_id === blockId);
      if (block) {
        const key = `${block.relative_path}:${block._function_name || 'unknown'}`;
        if (!detectedMap.has(key)) {
          detectedMap.set(key, []);
        }
        detectedMap.get(key).push(group.group_id);
      }
    });
  });

  return { expectedMap, detectedMap };
}

/**
 * Extract member keys from a detected group
 *
 * @param {Object} detectedGroup - A detected group
 * @returns {Array<string>} Array of member keys
 */
function extractDetectedMembers(detectedGroup) {
  return (detectedGroup.member_block_ids || [])
    .map(blockId => {
      const block = detectedGroup._blocks?.find(b => b.block_id === blockId);
      return block ? `${block.relative_path}:${block._function_name || 'unknown'}` : null;
    })
    .filter(Boolean);
}

/**
 * Find true positives and false negatives by comparing expected to detected groups
 *
 * @param {Array} expectedGroups - Expected groups from ground truth
 * @param {Array} detectedGroups - Groups detected by scanner
 * @returns {Object} truePositives and falseNegatives arrays
 */
function findTruePositivesAndFalseNegatives(expectedGroups, detectedGroups) {
  const truePositives = [];
  const falseNegatives = [];

  expectedGroups.forEach(expectedGroup => {
    const expectedMembers = expectedGroup.members.map(m => `${m.file}:${m.function}`);
    let matchFound = false;

    detectedGroups.forEach(detectedGroup => {
      const detectedMembers = extractDetectedMembers(detectedGroup);
      const overlap = expectedMembers.filter(m => detectedMembers.includes(m));
      const overlapRatio = overlap.length / Math.max(expectedMembers.length, detectedMembers.length);

      if (overlapRatio >= 0.5) {
        matchFound = true;
        truePositives.push({
          expected: expectedGroup.group_id,
          detected: detectedGroup.group_id,
          overlap: overlap.length,
          expected_members: expectedMembers.length,
          detected_members: detectedMembers.length,
          overlap_ratio: overlapRatio
        });
      }
    });

    if (!matchFound) {
      falseNegatives.push({
        group_id: expectedGroup.group_id,
        description: expectedGroup.description,
        members: expectedMembers
      });
    }
  });

  return { truePositives, falseNegatives };
}

/**
 * Find false positives from detected groups that don't match expected groups
 *
 * @param {Array} detectedGroups - Groups detected by scanner
 * @param {Array} truePositives - Already identified true positives
 * @returns {Array} False positive entries
 */
function findUnmatchedDetections(detectedGroups, truePositives) {
  const falsePositives = [];

  detectedGroups.forEach(detectedGroup => {
    const matchFound = truePositives.some(tp => tp.detected === detectedGroup.group_id);
    if (!matchFound) {
      falsePositives.push({
        group_id: detectedGroup.group_id,
        members: extractDetectedMembers(detectedGroup),
        pattern: detectedGroup.pattern_id
      });
    }
  });

  return falsePositives;
}

/**
 * Process false positive candidates to find true negatives and additional false positives
 *
 * @param {Array} falsePositiveCandidates - Functions that should NOT be detected
 * @param {Map} detectedMap - Map of detected function keys
 * @returns {Object} trueNegatives and additionalFalsePositives arrays
 */
function processFalsePositiveCandidates(falsePositiveCandidates, detectedMap) {
  const trueNegatives = [];
  const additionalFalsePositives = [];

  falsePositiveCandidates.forEach(candidate => {
    const key = `${candidate.file}:${candidate.function}`;
    const wasDetected = detectedMap.has(key);

    if (!wasDetected) {
      trueNegatives.push({
        function: candidate.function,
        file: candidate.file,
        reason: candidate.reason
      });
    } else {
      additionalFalsePositives.push({
        function: candidate.function,
        file: candidate.file,
        reason: `Detected as duplicate but should not be: ${candidate.reason}`
      });
    }
  });

  return { trueNegatives, additionalFalsePositives };
}

/**
 * Compare detected results against expected ground truth
 *
 * @param {Array} detectedGroups - Groups detected by scanner
 * @param {Array} expectedGroups - Expected groups from ground truth
 * @param {Array} falsePositiveCandidates - Functions that should NOT be detected
 * @returns {Object} Comparison results with TP, FP, FN, TN
 */
export function compareResults(detectedGroups, expectedGroups, falsePositiveCandidates = []) {
  const { detectedMap } = buildLookupMaps(expectedGroups, detectedGroups);
  const { truePositives, falseNegatives } = findTruePositivesAndFalseNegatives(expectedGroups, detectedGroups);
  const unmatchedFalsePositives = findUnmatchedDetections(detectedGroups, truePositives);
  const { trueNegatives, additionalFalsePositives } = processFalsePositiveCandidates(falsePositiveCandidates, detectedMap);

  return {
    truePositives,
    falsePositives: [...unmatchedFalsePositives, ...additionalFalsePositives],
    falseNegatives,
    trueNegatives,
    partialMatches: []
  };
}

/**
 * Calculate all accuracy metrics
 *
 * @param {Object} comparisonResults - Results from compareResults()
 * @returns {Object} All metrics with scores and percentages
 */
export function calculateAllMetrics(comparisonResults) {
  const tp = comparisonResults.truePositives.length;
  const fp = comparisonResults.falsePositives.length;
  const fn = comparisonResults.falseNegatives.length;
  const tn = comparisonResults.trueNegatives.length;

  const precision = calculatePrecision(tp, fp);
  const recall = calculateRecall(tp, fn);
  const f1Score = calculateF1Score(precision, recall);
  const fpRate = calculateFalsePositiveRate(fp, tn);

  return {
    counts: { tp, fp, fn, tn },
    precision: {
      score: precision,
      percentage: (precision * 100).toFixed(2) + '%',
      interpretation: precision >= 0.9 ? 'Excellent' : precision >= 0.8 ? 'Good' : precision >= 0.7 ? 'Fair' : 'Poor'
    },
    recall: {
      score: recall,
      percentage: (recall * 100).toFixed(2) + '%',
      interpretation: recall >= 0.9 ? 'Excellent' : recall >= 0.8 ? 'Good' : recall >= 0.7 ? 'Fair' : 'Poor'
    },
    f1Score: {
      score: f1Score,
      percentage: (f1Score * 100).toFixed(2) + '%',
      interpretation: f1Score >= 0.9 ? 'Excellent' : f1Score >= 0.8 ? 'Good' : f1Score >= 0.7 ? 'Fair' : 'Poor'
    },
    falsePositiveRate: {
      score: fpRate,
      percentage: (fpRate * 100).toFixed(2) + '%',
      interpretation: fpRate <= 0.1 ? 'Excellent' : fpRate <= 0.2 ? 'Good' : fpRate <= 0.3 ? 'Fair' : 'Poor'
    }
  };
}

/**
 * Generate a detailed accuracy report
 *
 * @param {Object} metrics - Metrics from calculateAllMetrics()
 * @param {Object} comparisonResults - Results from compareResults()
 * @param {Object} targets - Target metrics for comparison
 * @returns {Object} Detailed report
 */
export function generateAccuracyReport(metrics, comparisonResults, targets = {}) {
  const defaultTargets = {
    precision: 0.9,
    recall: 0.8,
    f1_score: 0.85,
    false_positive_rate: 0.1
  };

  const actualTargets = { ...defaultTargets, ...targets };

  return {
    summary: {
      total_expected_groups: comparisonResults.truePositives.length + comparisonResults.falseNegatives.length,
      total_detected_groups: comparisonResults.truePositives.length + comparisonResults.falsePositives.length,
      correctly_detected: comparisonResults.truePositives.length,
      missed: comparisonResults.falseNegatives.length,
      false_alarms: comparisonResults.falsePositives.length,
      correctly_ignored: comparisonResults.trueNegatives.length
    },
    metrics: metrics,
    targets: {
      precision: {
        target: actualTargets.precision,
        actual: metrics.precision.score,
        met: metrics.precision.score >= actualTargets.precision,
        delta: (metrics.precision.score - actualTargets.precision).toFixed(3)
      },
      recall: {
        target: actualTargets.recall,
        actual: metrics.recall.score,
        met: metrics.recall.score >= actualTargets.recall,
        delta: (metrics.recall.score - actualTargets.recall).toFixed(3)
      },
      f1_score: {
        target: actualTargets.f1_score,
        actual: metrics.f1Score.score,
        met: metrics.f1Score.score >= actualTargets.f1_score,
        delta: (metrics.f1Score.score - actualTargets.f1_score).toFixed(3)
      },
      false_positive_rate: {
        target: actualTargets.false_positive_rate,
        actual: metrics.falsePositiveRate.score,
        met: metrics.falsePositiveRate.score <= actualTargets.false_positive_rate,
        delta: (actualTargets.false_positive_rate - metrics.falsePositiveRate.score).toFixed(3)
      }
    },
    overall_assessment: {
      all_targets_met:
        metrics.precision.score >= actualTargets.precision &&
        metrics.recall.score >= actualTargets.recall &&
        metrics.f1Score.score >= actualTargets.f1_score &&
        metrics.falsePositiveRate.score <= actualTargets.false_positive_rate,
      grade: calculateGrade(metrics)
    },
    details: comparisonResults
  };
}

/**
 * Calculate overall grade based on metrics
 *
 * @param {Object} metrics - Calculated metrics
 * @returns {string} Grade (A+, A, B, C, D, F)
 */
function calculateGrade(metrics) {
  const score = (
    metrics.precision.score * 0.35 +
    metrics.recall.score * 0.35 +
    metrics.f1Score.score * 0.20 +
    (1 - metrics.falsePositiveRate.score) * 0.10
  );

  if (score >= 0.95) return 'A+';
  if (score >= 0.90) return 'A';
  if (score >= 0.85) return 'B+';
  if (score >= 0.80) return 'B';
  if (score >= 0.75) return 'C+';
  if (score >= 0.70) return 'C';
  if (score >= 0.60) return 'D';
  return 'F';
}
