# Khayt UI design assets

Drop your mockup files in **this folder** (`design/` at the repo root).

## Quick check (run inside the Khayt folder)

```bash
pwd
ls -la design/
```

You should see PNG, JPG, or PDF files — not only `README.md`.

## Sync so the Cloud Agent can see your files

If you copied files in Cursor on your laptop but the agent still says the folder is empty:

1. In Cursor, open **Source Control** (branch icon).
2. Confirm `design/your-file.png` appears under **Changes**.
3. **Commit** (e.g. `chore: add UI mockups`) → **Push**.

Or attach the main screens to the **chat** (drag PNG/PDF into the message).

## Copy from Downloads (macOS)

```bash
cd ~/Downloads/Khayt
# ↑ use YOUR real path — run `pwd` after opening the folder in Cursor

mkdir -p design
cp -r ~/Downloads/design/* design/
ls design
git add design/
git commit -m "chore: add UI design mockups"
git push
```

## Copy from Downloads (Windows PowerShell)

```powershell
cd $env:USERPROFILE\Downloads\Khayt
mkdir design -Force
Copy-Item "$env:USERPROFILE\Downloads\design\*" design\ -Recurse
dir design
git add design/
git commit -m "chore: add UI design mockups"
git push
```

## After upload

Tell the agent: *“design is pushed”* and the **main file name** to implement first (e.g. `dashboard.png`).
