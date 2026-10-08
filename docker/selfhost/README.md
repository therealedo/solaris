# Self hosting Solaris for free

This folder runs the whole game (client, API, background jobs, MongoDB) from this
repository's source with Docker Compose, behind Caddy, which adds HTTPS automatically
when you use a domain name.

## Option A: try it on your own computer

Needs Docker Desktop (Windows/macOS) or Docker Engine (Linux).

```bash
git clone https://github.com/therealedo/solaris.git
cd solaris
git checkout claude/project-thread-dvcrtw   # until the PR is merged
cp docker/selfhost/.env.example docker/selfhost/.env
docker compose -f docker/selfhost/docker-compose.yml --env-file docker/selfhost/.env up -d --build
```

The first build takes a few minutes. Then open http://localhost, create an account and
click **Play vs AI** on the games list. Turn based games tick as soon as you press ready;
real-time games tick on the speed you chose.

Stop it with `docker compose -f docker/selfhost/docker-compose.yml down` (add `-v` to wipe the database).

## Option B: a free server others can reach (Oracle Cloud Always Free)

Oracle's Always Free tier includes an Arm (Ampere A1) virtual machine that stays on 24/7
at no cost, which is enough for this whole stack. As of 2026 Oracle documents the free
Arm allowance as 2 OCPUs and 12 GB of memory, so create the VM with those values.

1. **Create an account** at https://www.oracle.com/cloud/free/. A card is needed for
   identity checks; stay on the Always Free resources and you are not charged.
2. **Create the VM**: Compute, Instances, Create instance. Image: Ubuntu 24.04.
   Shape: Ampere `VM.Standard.A1.Flex` with 2 OCPUs and 12 GB. Add your SSH key.
   If you get "Out of host capacity", try another availability domain or try again later.
3. **Open ports 80 and 443**: in the instance's subnet, Security List, add ingress rules
   for TCP 80 and 443 from `0.0.0.0/0`. Then on the VM:
   ```bash
   sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
4. **Get a free domain**: sign in at https://www.duckdns.org, create a subdomain such as
   `my-solaris` and point it at the VM's public IP.
5. **Install Docker** on the VM:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
6. **Configure and start**:
   ```bash
   git clone https://github.com/therealedo/solaris.git && cd solaris
   git checkout claude/project-thread-dvcrtw   # until the PR is merged
   cp docker/selfhost/.env.example docker/selfhost/.env
   nano docker/selfhost/.env
   ```
   Set:
   ```
   SITE_ADDRESS=my-solaris.duckdns.org
   SITE_URL=https://my-solaris.duckdns.org
   SESSION_SECURE_COOKIES=true
   SESSION_SECRET=<output of: openssl rand -hex 32>
   ```
   Then:
   ```bash
   docker compose -f docker/selfhost/docker-compose.yml --env-file docker/selfhost/.env up -d --build
   ```
7. Open `https://my-solaris.duckdns.org`. Caddy gets the HTTPS certificate on first visit.

## Optional: AI personas with Google Gemini (free)

Without an API key, bots in single player games use simple rules for diplomacy and
chat. With a free Gemini key, each bot plays a persona (the Warlord, the Silver Tongue,
the Diplomat...), answers your messages in character and schemes once per production cycle.

1. Sign in at https://aistudio.google.com/apikey with a Google account and create a key.
   Don't add billing to that Google Cloud project, so it stays on the free tier.
2. Put it in `docker/selfhost/.env` as `GEMINI_API_KEY=...` and run the `up -d --build` command again.

The default budget (5 requests a minute and 400 a day for each of the two server
processes) keeps usage inside the free tier. When the budget runs out, bots quietly fall
back to rules until it resets. The budget is shared by every game on the server, so
each account can have at most 3 single player games in progress. Note that Google may use free tier prompts to improve its
products, so don't put anything private in chat.

**Difficulty and AI opponents.** The create page's **AI Difficulty** decides how strong
bots play compared to the humans (Easy, Normal, Hard, Brutal; Classic is the original AI).
Bots earn more or fewer credits each cycle to stay at that level. In a normal game,
**AI Opponents** gives some slots to persona bots, and the game starts when humans fill the rest.

**Updating** after new commits: `git pull` and run the same `up -d --build` command.

**Things to know**
- Oracle may reclaim Always Free instances that sit nearly idle for a week. A game in
  progress keeps it busy; if it is reclaimed, recreate it and run the steps again
  (back up with `docker compose exec database mongodump --archive > backup.archive`).
- Emails (password resets, turn reminders) are off. Set the `SMTP_*` variables on the
  `api` and `jobs` services if you want them.
- The jobs container also creates the official game lobbies, as the live site does.
