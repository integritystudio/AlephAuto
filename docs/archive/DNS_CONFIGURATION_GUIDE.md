# DNS Configuration Guide for alephcondense.dev

## Overview

Your duplicate detection report has been successfully deployed to GitHub Pages and is ready to go live at **https://alephcondense.dev** once DNS is configured.

## Current Status

✅ **Completed:**
- GitHub repository created: https://github.com/aledlie/alephcondense
- GitHub Pages enabled with CNAME file
- HTML duplicate detection report deployed
- Report stats: 10,226 code blocks, 2,518 duplicate groups, 2,188 quick wins

⏳ **Pending:**
- DNS configuration (manual setup required due to API access issues)

## Manual DNS Configuration Steps

### Option 1: Porkbun Web Interface (Recommended)

1. **Log in to Porkbun**
   - Visit: https://porkbun.com/account/domainsSLD
   - Find and select `alephcondense.dev`

2. **Navigate to DNS Management**
   - Click on the domain
   - Go to "DNS Records" section

3. **Delete Existing Records** (if any)
   - Remove any existing A or CNAME records for @ and www

4. **Add GitHub Pages A Records**
   - Add **four** A records for the apex domain (@):

   ```
   Type: A
   Host: @ (or leave blank for apex domain)
   Answer: 185.199.108.153
   TTL: 600

   Type: A
   Host: @
   Answer: 185.199.109.153
   TTL: 600

   Type: A
   Host: @
   Answer: 185.199.110.153
   TTL: 600

   Type: A
   Host: @
   Answer: 185.199.111.153
   TTL: 600
   ```

5. **Add WWW CNAME Record**

   ```
   Type: CNAME
   Host: www
   Answer: aledlie.github.io
   TTL: 600
   ```

6. **Save and Wait**
   - Save all changes
   - DNS propagation takes 5-60 minutes typically

### Option 2: Porkbun API (If Access is Enabled)

If API access issues are resolved, run:

```bash
node /tmp/configure-dns.js
```

This script will automatically:
- Test API connectivity
- Create all required A records
- Create CNAME record for www
- Verify configuration

## Troubleshooting API Access

If you want to use the API in the future:

1. **Enable API Access**
   - Log in to Porkbun
   - Go to Account → API Access
   - Enable API access
   - Whitelist your IP address if required

2. **Verify Domain API Access**
   - Some domains need API access enabled individually
   - Check domain settings → API Access → Enable

3. **Update Credentials in Doppler**
   - Current credentials are stored in:
     - Project: `integrity-studio`
     - Config: `dev`
     - Keys: `PORKBUN_API_KEY`, `PORKBUN_SECRET_API_KEY`

## Verification Steps

### 1. Check DNS Propagation

```bash
# Check A records
dig alephcondense.dev A

# Check CNAME record
dig www.alephcondense.dev CNAME

# Or use online tool
# https://dnschecker.org/#A/alephcondense.dev
```

### 2. Test Site Access

After DNS propagates (5-60 minutes):

1. Visit: https://alephcondense.dev
2. GitHub Pages will automatically:
   - Detect the custom domain
   - Issue an SSL certificate (takes a few minutes)
   - Serve the duplicate detection report

### 3. Enable HTTPS in GitHub (Optional)

1. Go to repository settings: https://github.com/aledlie/alephcondense/settings/pages
2. Once DNS propagates, check "Enforce HTTPS"

## Expected DNS Records

After configuration, your DNS should look like this:

```
alephcondense.dev.        600   IN  A     185.199.108.153
alephcondense.dev.        600   IN  A     185.199.109.153
alephcondense.dev.        600   IN  A     185.199.110.153
alephcondense.dev.        600   IN  A     185.199.111.153
www.alephcondense.dev.    600   IN  CNAME aledlie.github.io.
```

## Report Features

Once live, the site will display:

- **Interactive Dashboard** with gradient design
- **10,226 code blocks** analyzed from PersonalSite
- **2,518 duplicate groups** identified
- **2,188 quick wins** available for implementation
- Color-coded metrics and impact scores
- Strategy distribution charts
- Detailed migration steps with time estimates
- Risk indicators and breaking change warnings

## Updating the Report

To update the report with new scan results:

```bash
# Run new scan
node test-scan-pipeline.js ~/code/PersonalSite

# Copy new report to repository
cp output/reports/scan-*.html /tmp/alephcondense/index.html

# Commit and push
cd /tmp/alephcondense
git add index.html
git commit -m "Update duplicate detection report"
git push origin main

# Wait 1-2 minutes for GitHub Pages to rebuild
```

## Additional Resources

- **Porkbun DNS Documentation**: https://kb.porkbun.com/article/65-how-to-configure-dns
- **GitHub Pages Custom Domain**: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site
- **DNS Propagation Checker**: https://dnschecker.org

## Support

If you encounter issues:

1. **DNS not propagating**: Wait up to 48 hours (usually much faster)
2. **SSL certificate issues**: GitHub auto-issues after DNS verification
3. **404 errors**: Check CNAME file exists in repository
4. **API 403 errors**: Use manual DNS configuration via Porkbun web interface

---

**Repository**: https://github.com/aledlie/alephcondense
**Future URL**: https://alephcondense.dev

Generated: 2025-11-12
