const MAX_DEPTH = 50;

export function getAncestors(category, allCategories) {
  if (!category) return [];
  const ancestors = [];
  let current = category;
  let hops = 0;
  while (current?.parent != null && hops < MAX_DEPTH) {
    const parent = allCategories.find((candidate) => candidate.id === current.parent);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
    hops += 1;
  }
  return ancestors;
}

export function getDepth(category, allCategories) {
  return getAncestors(category, allCategories).length;
}

export function buildIndentedOptions(allCategories, { excludeIds = [] } = {}) {
  const excluded = new Set();
  const addWithDescendants = (id) => {
    if (excluded.has(id)) return;
    excluded.add(id);
    allCategories
      .filter((category) => category.parent === id)
      .forEach((child) => addWithDescendants(child.id));
  };
  excludeIds.forEach(addWithDescendants);

  const visible = allCategories.filter((category) => !excluded.has(category.id));
  const byParent = new Map();
  visible.forEach((category) => {
    const key = category.parent ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(category);
  });

  const options = [];
  const walk = (parentId, depth) => {
    const children = byParent.get(parentId) || [];
    children.forEach((category) => {
      options.push({ id: category.id, label: "　".repeat(depth) + category.name });
      walk(category.id, depth + 1);
    });
  };
  walk(null, 0);
  return options;
}
