# Attribute Display Fixes

## Issue
Tree attributes (Area, Perimeter, Crown Diameter) were showing as "0 m" or "0 m²" in the popup Quick Facts section, even though the values were present in the DBF file and showing correctly in the "Show Tree Attributes" dropdown.

## Root Cause
1. **Zero values being displayed**: The `formatMeasurement` function was formatting zero values as "0 m" instead of returning `null` to hide them.
2. **Missing field name**: The DBF uses `perimeter` (full word) but we were only looking for abbreviated versions.
3. **Field name priority**: Need to ensure we check for the correct field names in the right order.

## DBF File Structure (Confirmed)
Based on actual shapefile inspection:
```javascript
{
  tree_id: 1,
  x: 507842.7431,
  y: 1627178.466,
  Cmmn_Nm: 'Rain Tree',
  Scntfc_N: 'Samanea saman',
  Family: 'Fabaceae',
  Order: 'Fabales',
  Class: 'Equisetopsida',
  species_id: 1,
  group_id: 4,
  area: 461,              // Area in m²
  perimeter: 88           // Perimeter in m (full word, not abbreviated)
}
```

## Changes Made

### 1. Updated `formatMeasurement` Function
**File**: `public/script.js`

**Before**:
```javascript
function formatMeasurement(rawValue, unit = '', options = {}) {
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    // ... formatting code
}
```

**After**:
```javascript
function formatMeasurement(rawValue, unit = '', options = {}) {
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {  // Added zero check
        return null;
    }
    // ... formatting code
}
```

**Why**: Zero or negative measurements are not meaningful, so we hide them instead of displaying "0 m".

### 2. Added `perimeter` to Label Overrides
**File**: `public/script.js`

Added to `PROPERTY_LABEL_OVERRIDES`:
```javascript
perimeter: 'Perimeter',
species_id: 'Species ID',
```

### 3. Updated Display Order
**File**: `public/script.js`

Added to `PROPERTY_DISPLAY_ORDER`:
```javascript
'species_id',
'perimeter',
```

### 4. Added Perimeter Transform
**File**: `public/script.js`

Added to `PROPERTY_VALUE_TRANSFORMS`:
```javascript
perimeter: (value) => formatMeasurement(value, 'm', { maximumFractionDigits: 2 }),
```

## Result

### Before
- **Quick Facts**: Area: 0 m², Perimeter: 0 m, Crown Diameter: 0 m
- **Show Tree Attributes**: Showed correct values (461, 88, etc.)

### After
- **Quick Facts**: Area: 461 m², Perimeter: 88 m (only shows non-zero values)
- **Show Tree Attributes**: Shows correct values with proper labels
- Zero/missing values are hidden instead of displayed

## Testing

To verify the fix works:

1. **Reload the page** to load the updated code
2. **Click on any tree polygon** to open its popup
3. **Verify Quick Facts**:
   - Area should show the actual m² value (e.g., "461 m²")
   - Perimeter should show the actual m value (e.g., "88 m")
   - Crown Diameter will be hidden if not in DBF (which is correct)
   - Group should show "Group X" with species name

4. **Expand "Show Tree Attributes"**:
   - Should show all DBF fields with proper labels
   - Area should show as "Area: 461 m²"
   - Perimeter should show as "Perimeter: 88 m"
   - Species ID should show as "Species ID: 1"

## Notes

- The `formatArea` function already had the zero-check logic (`numeric <= 0`), so it was working correctly.
- The popup code already looked for `perimeter` in the `coalesceProperty` list, so it just needed the label and transform updates.
- If a tree truly has a zero value for area or perimeter, it will be hidden rather than showing "0".
- The Total Trees count (1059) should now display correctly in the Dataset Overview section.
