# Project page (operator UI)

Local control plane for the linked WordPress instance.

- Open `index.html` via a tiny static server so `fetch` of `../../src/wp/instance.json` works:

```bash
cd ~/OG/dev/OS-021-WordPress-CMS
python3 -m http.server 8021 --bind 127.0.0.1
# then http://127.0.0.1:8021/docs/project-page/
```

Tabs: Overview · Installed Plugins · Themes · Settings · ACF.
