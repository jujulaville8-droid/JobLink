# Android CV upload manual checklist

Run every case on Android Chrome and Samsung Internet, ideally on Galaxy A07/A13 devices including older Samsung Internet (Chromium 92–101). Record phone, Android version, browser version, date, and pass/fail. These checks have not been executed on physical devices.

Use a verified seeker account with required application fields filled and an open job. Start with no saved CV for upload-then-apply. Test ordinary profile editing and editing reached from an application.

| Case | Steps | Expected result |
| --- | --- | --- |
| PDF | Select a PDF from the phone document picker in profile Step 3. | Progress appears; upload and automatic profile save complete. Confirmation says the resume is saved. Reload and preview the PDF. |
| DOCX | Select DOCX from Downloads/Files, including uppercase extension and Resume (1).docx. | Empty or generic MIME does not block upload. Resume saves and remains available after reload. |
| Resume photo | Select a JPG photograph of a resume. | Upload and automatic save succeed; preview shows the photo after reload. |
| Over 10 MB | Select a file larger than 10 MB, then a smaller one. | Clear too-large / 10 MB limit error before upload; no success claim. Smaller file uploads and saves. |
| Airplane mode mid-upload | Start a large upload; enable airplane mode during transfer. Wait for error or timeout, restore connectivity, and select the same file. | Clear failure and support fallback; no saved-success claim. Input becomes usable; retry uploads and saves. |
| Upload then apply without Save | Upload, wait for upload and save confirmation, then immediately open the job and apply without pressing Save. Repeat from an application completion link. | CV is persisted; no Resume (upload or build one) blocker. Application can proceed; the wizard stays on Step 3 with the saved confirmation. Manual Save and return to application performs the return. No builder navigation. |
| Slow connection | Throttle network; upload PDF and DOCX while observing authorization, transfer, and profile save. | Progress/busy feedback remains visible. Input and wizard actions remain disabled through saving. Unsettled authorization fetch or response body aborts around 30 seconds; transfer retains its 10-minute timeout. Failures show errors and allow retry; successful uploads save before confirmation. |
| Profile save failure | Allow storage upload but fail POST /api/profile. Restore endpoint and press Save. | Inline error says file uploaded but saving failed, with Save retry instruction. No saved-success claim or redirect on failure. Save retries the new CV path and current edits; reload confirms persistence. |
| Manual Save and builder | Edit other fields and Save. Separately choose Save profile and build a resume instead. | Manual Save persists edits and CV. Only the explicit builder action opens the builder and retains application return context. |

Support fallback remains visible: Having trouble? Email your resume to support@joblinkantigua.com.
