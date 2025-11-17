# Mobile & Ngrok Optimization Guide

## Ngrok Request Limit Issues

The free ngrok tier has request limits. Our map tiles generate many requests. Here's what was optimized:

### 1. **Tile Request Reduction** ✅
- **No base layer by default** - OSM/Esri tiles disabled (saves ~100 requests per load)
- **Restricted bounds** - Tiles only load within La Mesa forest area
- **Zoom limits**: Min 16, Max 21 (reduced from 15-22)
- **Starting zoom**: Level 17 (fewer initial tiles)
- **Update strategy**: `updateWhenIdle: true` - only loads after panning stops

### 2. **Aggressive Browser Caching** ✅
- Tiles cached for **30 days** in browser
- `immutable` flag prevents revalidation requests
- ETags for efficient cache validation
- First visit loads tiles, subsequent visits use cache

### 3. **Map Configuration**
- `maxBounds` prevents loading tiles outside forest
- `keepBuffer: 2` reduces redundant tile requests
- `updateWhenZooming: false` prevents mid-zoom loading

## Estimated Request Savings

**Before optimizations:**
- OSM base layer: ~50-100 tiles per page load
- Forest tiles: ~50-80 tiles (zoom 15-22)
- Total: ~100-180 requests per session

**After optimizations:**
- No base layer: 0 requests
- Forest tiles: ~20-40 tiles (zoom 16-21, restricted bounds)
- Cached tiles: 0 requests on repeat visits
- **Total: ~20-40 requests first visit, ~0-5 after caching**

## Ngrok Free Tier Limits
- **40,000 requests/month** (~1,333/day)
- With optimizations: ~30-50 sessions per day sustainable
- Browser cache makes repeat testing nearly free

## Alternative Solutions

If you still hit limits:

1. **Use ngrok paid tier** ($8/month)
   - 120,000 requests/month
   - Custom domains
   - No request warnings

2. **Deploy to free hosting** (for longer demos)
   - Railway.app (512MB free)
   - Render.com (750 hours/month)
   - Fly.io (3GB transfer/month)
   - Note: Upload tiles folder (~261MB)

3. **Local testing with phone on same WiFi**
   ```bash
   # Get your computer's IP
   ipconfig
   # Share at http://192.168.x.x:3000
   ```

4. **Reduce tile folder size** (if needed)
   - Only keep zoom levels 17-20
   - Delete unused base layer tiles
   - Converts ~261MB → ~100MB

## Current Configuration

- **Server**: Running on port 3000 with 30-day tile caching
- **Map bounds**: La Mesa forest area only
- **Zoom range**: 16-21 (optimal for forest detail)
- **Base layer**: Disabled by default (add via layer control if needed)
- **Mobile UI**: Collapsible controls, bottom drawer sidebar

## Testing Tips

1. **Clear browser cache** before testing request counts
2. **Check ngrok dashboard** for request metrics
3. **Use browser DevTools Network tab** to verify caching
4. **Test on mobile** - first visit loads tiles, reload should hit cache

## Performance Metrics

You should now see:
- ✅ Faster page loads (fewer tiles)
- ✅ Smooth panning (buffer tiles cached)
- ✅ Minimal repeat requests (30-day cache)
- ✅ Mobile-optimized UI (collapsible controls)
- ✅ Extended ngrok usage (90%+ request reduction)
