// reporters/email-reporter.cjs
require('dotenv/config')
const fs = require('fs')
const path = require('path')
const nodemailer = require('nodemailer')

function escapeHtml(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

/**
 * Extract test logs
 */
function extractTestLogs(logs) {
    const text = logs || '';
    const lines = text.split('\n');
    const startIdx = lines.findIndex(l => l.includes('--- Test Started:'));
    const endIdx = lines.findIndex(l => l.includes('--- Test Finished:'));

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        return lines.slice(startIdx, endIdx + 1).join('\n');
    }
    return text; 
}

/**
 * Extract error details from logs - IMPROVED
 */
function extractErrorDetails(logs) {
    const text = logs || '';
    const lines = text.split('\n');
    
    // Method 1: Find [FAILURE] section
    const failStartIdx = lines.findIndex(l => l.includes('[FAILURE]'));
    if (failStartIdx !== -1) {
        const errorLines = [];
        for (let i = failStartIdx; i < Math.min(lines.length, failStartIdx + 40); i++) {
            errorLines.push(lines[i]);
        }
        return errorLines.join('\n');
    }
    
    // Method 2: Find [ERROR] section
    const errorStartIdx = lines.findIndex(l => l.includes('[ERROR]'));
    if (errorStartIdx !== -1) {
        const errorLines = [];
        for (let i = errorStartIdx; i < Math.min(lines.length, errorStartIdx + 20); i++) {
            errorLines.push(lines[i]);
        }
        return errorLines.join('\n');
    }
    
    // Method 3: Find "Error:" pattern
    const errorLineIdx = lines.findIndex(l => l.includes('Error:') || l.includes('TEST FAILED'));
    if (errorLineIdx !== -1) {
        const errorLines = [];
        for (let i = Math.max(0, errorLineIdx - 2); i < Math.min(lines.length, errorLineIdx + 15); i++) {
            errorLines.push(lines[i]);
        }
        return errorLines.join('\n');
    }
    
    return null;
}


class EmailReporter {
  constructor() {
    this.testRuns = new Map(); 
    this.stats = { passed: 0, failed: 0, skipped: 0, warnings: 0, errors: 0 };
  }

  onTestEnd(test, result) {
    this.testRuns.set(test.id, { test, result });
  }

  async onEnd() {
    const allTests = [];
    
    for (const { test, result } of this.testRuns.values()) {
        if (result.status === 'passed') this.stats.passed++
        else if (result.status === 'failed' || result.status === 'timedOut') this.stats.failed++
        else this.stats.skipped++

        const hasWarning = (result.annotations || []).some(a => a.type === 'warning')

        const rawLogs = (result.stdout || []).map(item => item.toString()).join('\n') + 
                     (result.stderr || []).map(item => item.toString()).join('\n');
        const logs = extractTestLogs(rawLogs);
        const errorDetails = extractErrorDetails(rawLogs);

        // Count errors from logs
        const errorCount = (rawLogs.match(/\[ERROR\]/g) || []).length;
        const warnCount = (rawLogs.match(/\[WARN\]/g) || []).length;
        this.stats.errors += errorCount;
        this.stats.warnings += warnCount;

        // Get ALL attachments
        const rawAttachments = result.attachments || [];
        
        // Separate videos and images - use ALL for failed tests
        const isFailure = result.status === 'failed' || result.status === 'timedOut';
        const hasIssues = hasWarning || errorCount > 0 || warnCount > 0;
        const isPassed = result.status === 'passed' && !hasIssues;
        
        let videos = [];
        let images = [];
        
        if (isPassed) {
          // For passed tests, only include video_passed
          videos = rawAttachments.filter(a => a.name === 'video_passed.webm');
          images = [];
        } else {
          // For failed/issue tests, include ALL video and image attachments
          videos = rawAttachments.filter(a => {
            if (!a.path || !/\.(webm|mp4|mkv)$/i.test(a.path)) return false;
            return true; // Include all videos for failed tests
          });
          
          images = rawAttachments.filter(a => {
            if (!a.path || !/\.(png|jpg|jpeg|gif|webp)$/i.test(a.path)) return false;
            return true; // Include all images for failed tests
          });
        }

        allTests.push({
            test,
            result,
            logs,
            errorDetails,
            videos,
            images,
            hasWarning,
            hasIssues,
            isFailure,
            isPassed
        });
    }

    const totalTests = this.stats.passed + this.stats.failed + this.stats.skipped;

    // ---------------------------------------------------------
    // EMAIL 1: Daily Summary
    // ---------------------------------------------------------
    if (process.env.DAILY_REPORT_EMAILS) {
      const subject = this.stats.failed > 0 
        ? `⚠️ Dataset Daily Report: ${this.stats.failed} Failed, ${this.stats.warnings} Warnings` 
        : `✅ Dataset Daily Report: All Tests Passed`
      
      const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <h2 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">Dataset Daily Summary</h2>
            <p>Website testing has completed.</p>
            <table style="width: 100%; text-align: center; margin: 20px 0; border-collapse: collapse;">
              <tr>
                <td style="padding: 15px; background: #f9f9f9; border: 1px solid #ddd;"><strong>Total</strong><br/>${totalTests}</td>
                <td style="padding: 15px; background: #e8f5e9; border: 1px solid #ddd;"><strong>Passed</strong><br/><span style="color:green; font-size: 18px;">${this.stats.passed}</span></td>
                <td style="padding: 15px; background: #ffebee; border: 1px solid #ddd;"><strong>Failed</strong><br/><span style="color:red; font-size: 18px;">${this.stats.failed}</span></td>
                <td style="padding: 15px; background: #fff3e0; border: 1px solid #ddd;"><strong>Warnings</strong><br/><span style="color:orange; font-size: 18px;">${this.stats.warnings}</span></td>
              </tr>
            </table>
            <p style="font-size: 12px; color: #888;">Time: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `
      try {
        await this._sendMail(process.env.DAILY_REPORT_EMAILS, subject, '', html, [])
        console.log(`📧 Daily summary sent`)
      } catch (err) { console.error('❌ Failed daily summary:', err) }
    }

    // ---------------------------------------------------------
    // EMAIL 2: Detailed Report
    // ---------------------------------------------------------
    if (process.env.FAILURE_ALERT_EMAILS) {
      const finalAttachments = [];
      let totalSize = 0;
      const MAX_SIZE = 20 * 1024 * 1024;

      const addAttachment = (att) => {
          if (!att.path || !fs.existsSync(att.path)) {
            console.warn(`Attachment file not found: ${att.path}`);
            return false;
          }
          const stats = fs.statSync(att.path);
          if (totalSize + stats.size > MAX_SIZE) return false;
          
          totalSize += stats.size;
          finalAttachments.push({
              filename: att.name || path.basename(att.path),
              path: att.path,
              contentType: att.contentType || 'application/octet-stream'
          });
          console.log(`Added attachment: ${att.name} (${(stats.size/1024).toFixed(1)} KB)`);
          return true;
      };

      const tableRows = allTests.map(item => {
        const { test, result, logs, errorDetails, videos, images, hasWarning, hasIssues, isFailure, isPassed } = item;
        
        let statusIcon = '✅'; let statusColor = '#28a745'; let statusText = 'PASSED';
        let statusBg = '#e8f5e9';
        
        if (isFailure) {
            statusIcon = '❌'; statusColor = '#dc3545'; statusText = 'FAILED';
            statusBg = '#ffebee';
        } else if (hasIssues) {
            statusIcon = '⚠️'; statusColor = '#ffc107'; statusText = 'WARNING';
            statusBg = '#fff3e0';
        }

        const displayLinks = [];
        
        if (isPassed) {
          displayLinks.push(`<span style="color:#999; font-style:italic;">✓ No attachments (test passed cleanly)</span>`);
        } else {
          // Add Images FIRST (smaller)
          images.forEach(img => {
              if (addAttachment(img)) {
                  displayLinks.push(`<span style="background:#e3f2fd; padding:4px 8px; border-radius:4px; font-size:11px; margin:2px; display:inline-block; font-family:monospace;">🖼️ ${escapeHtml(img.name)}</span>`);
              }
          });

          // Add Videos
          videos.forEach(vid => {
              const added = addAttachment(vid);
              if (added) {
                  const size = (fs.statSync(vid.path).size / (1024*1024)).toFixed(1);
                  displayLinks.push(`<span style="background:#f3e5f5; padding:4px 8px; border-radius:4px; font-size:11px; margin:2px; display:inline-block; font-family:monospace;">🎬 ${escapeHtml(vid.name)} (${size} MB)</span>`);
              } else {
                  displayLinks.push(`<span style="background:#f8d7da; color:#721c24; padding:4px 8px; border-radius:4px; font-size:11px; margin:2px; display:inline-block;">⚠️ Video (Skipped: Size Limit)</span>`);
              }
          });
          
          if (displayLinks.length === 0) {
            displayLinks.push(`<span style="color:#999;">No artifacts captured</span>`);
          }
        }

        // Error Details section - ALWAYS show for failures
        let errorSection = '';
        if (isFailure) {
          const errorToShow = errorDetails || result.error?.message || 'Unknown error';
          errorSection = `
            <div style="margin-top: 8px; padding: 10px; background: #ffebee; border-left: 4px solid #dc3545; border-radius: 4px;">
              <strong style="color: #dc3545;">❌ Error Details:</strong>
              <pre style="margin: 5px 0 0 0; font-size: 10px; white-space: pre-wrap; color: #333; max-height: 150px; overflow-y: auto; font-family: monospace;">${escapeHtml(errorToShow)}</pre>
            </div>
          `;
        } else if (hasIssues && !isFailure) {
          const warnCount = (logs.match(/\[WARN\]/g) || []).length;
          const errCount = (logs.match(/\[ERROR\]/g) || []).length;
          if (warnCount > 0 || errCount > 0) {
            errorSection = `
              <div style="margin-top: 8px; padding: 8px; background: #fff3e0; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 12px;">
                <span style="color: #856404;">⚠️ ${errCount} Errors, ${warnCount} Warnings detected</span>
              </div>
            `;
          }
        }

        return `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; vertical-align: top; width: 12%;">
              <span style="font-size: 10px; color: #666; font-family: monospace;">${test.location?.file ? path.basename(test.location.file) : 'N/A'}</span>
            </td>
            <td style="padding: 10px; vertical-align: top; width: 48%;">
              <strong style="font-size: 12px;">${escapeHtml(test.title)}</strong>
              ${errorSection}
              <details style="margin-top: 5px;">
                <summary style="cursor: pointer; color: #0066cc; font-size: 11px;">📋 View Console Logs</summary>
                <pre style="background: #f8f9fa; padding: 8px; border-radius: 4px; white-space: pre-wrap; max-height: 120px; overflow-y: auto; border: 1px solid #eee; margin-top: 5px; font-size: 9px; font-family: monospace;">${escapeHtml(logs)}</pre>
              </details>
            </td>
            <td style="padding: 10px; vertical-align: top; width: 12%; text-align: center;">
              <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; background: ${statusBg}; color: ${statusColor}; font-weight: bold; font-size: 11px;">
                ${statusIcon} ${statusText}
              </span>
            </td>
            <td style="padding: 10px; vertical-align: top; width: 28%; font-size: 10px;">
              ${displayLinks.join('<br/>')}
            </td>
          </tr>
        `;
      }).join('');

      const subject = `📋 Dataset Test Report: ${this.stats.passed} Passed, ${this.stats.failed} Failed`;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
                .container { max-width: 1100px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h2 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #007bff; color: white; padding: 10px; text-align: left; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🧪 Dataset Test Execution Report</h2>
                <p>Execution completed at: <strong>${new Date().toLocaleString()}</strong></p>
                <p style="font-size: 11px; color: #666;">Total attachments: ${(totalSize / (1024*1024)).toFixed(2)} MB / 20 MB</p>
                
                <table style="width: 100%; text-align: center; margin-bottom: 20px; border: 1px solid #ddd; border-collapse: collapse;">
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #ddd;"><strong>Total</strong><br/>${totalTests}</td>
                    <td style="padding: 12px; border: 1px solid #ddd; background: #e8f5e9;"><strong>Passed</strong><br/><span style="color:green; font-size: 16px;">${this.stats.passed}</span></td>
                    <td style="padding: 12px; border: 1px solid #ddd; background: #ffebee;"><strong>Failed</strong><br/><span style="color:red; font-size: 16px;">${this.stats.failed}</span></td>
                    <td style="padding: 12px; border: 1px solid #ddd; background: #fff3e0;"><strong>Warnings</strong><br/><span style="color:orange; font-size: 16px;">${this.stats.warnings}</span></td>
                  </tr>
                </table>

                <h3>📋 Detailed Test Results</h3>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 12%;">File</th>
                            <th style="width: 48%;">Test Case</th>
                            <th style="width: 12%;">Status</th>
                            <th style="width: 28%;">Attachments</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
                
                <div style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 11px; color: #666;">
                  <strong>Naming Convention:</strong> <code style="background:#eee; padding:2px 6px; border-radius:3px;">Filename_TestTitle_Reason.ext</code><br/>
                  ✅ Passed tests: No attachments | ❌ Failed tests: Screenshot + Video + Full error trace
                </div>
            </div>
        </body>
        </html>
      `;

      try {
        await this._sendMail(process.env.FAILURE_ALERT_EMAILS, subject, '', html, finalAttachments)
        console.log(`📧 Detailed report sent to: ${process.env.FAILURE_ALERT_EMAILS}`);
        console.log(`📊 Attachments: ${finalAttachments.length} files, ${(totalSize / (1024*1024)).toFixed(2)} MB`);
      } catch (err) { 
        console.error('❌ Failed detailed report:', err) 
      }
    }
  }

  async _sendMail(to, subject, text, html, attachments = []) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true' || false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, 
      subject,
      text,
      html,
      attachments
    }
    return transporter.sendMail(mailOptions)
  }
}

module.exports = EmailReporter
