export const speciesColors = {
  // Keep Unknown and default
  Unknown: '#a65628',
  default: '#ffc107',
};

const dynamicColorPalette = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
  '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5',
  '#3366cc', '#dc3912', '#ff9900', '#109618', '#990099',
  '#0099c6', '#dd4477', '#66aa00', '#b82e2e', '#316395',
];

export function createSpeciesColorHelper() {
  const dynamicSpeciesColors = {};
  let colorIndex = 0;

  function nextDynamicColor() {
    const color = dynamicColorPalette[colorIndex % dynamicColorPalette.length];
    colorIndex += 1;
    return color;
  }

  function reset() {
    Object.keys(dynamicSpeciesColors).forEach((key) => delete dynamicSpeciesColors[key]);
    colorIndex = 0;
  }

  function getColor(species, treeId, options = {}) {
    const {
      isPredictionMode = false,
      predictionData = [],
      predictionIndex = null,
      trainingColor = '#FFC107',
      correctColor = '#4CAF50',
      incorrectColor = '#F44336',
    } = options;

    if (isPredictionMode && treeId) {
      const treeIdStr = treeId.toString();
      const treeData = predictionIndex?.get(treeIdStr) ?? predictionData.find((entry) => entry.treeId === treeIdStr);

      if (treeData) {
        if (treeData.isTraining) {
          return trainingColor;
        }

        return treeData.correct ? correctColor : incorrectColor;
      }
    }

    if (!species) {
      return speciesColors.default;
    }

    if (speciesColors[species]) {
      return speciesColors[species];
    }

    const matchedKey = Object.keys(speciesColors).find(
      (key) => key !== 'default' && species.toLowerCase().includes(key.toLowerCase()),
    );

    if (matchedKey) {
      return speciesColors[matchedKey];
    }

    if (!dynamicSpeciesColors[species]) {
      dynamicSpeciesColors[species] = nextDynamicColor();
    }

    return dynamicSpeciesColors[species];
  }

  function getDynamicAssignments() {
    return { ...dynamicSpeciesColors };
  }

  return {
    getColor,
    reset,
    getDynamicAssignments,
  };
}
