# Continue this release with the laptop asleep

A local Codex session depends on the laptop remaining awake. A task started in
Codex Cloud runs in its own remote workspace and can continue while the computer
is asleep. See [OpenAI's cloud guide](https://learn.chatgpt.com/docs/cloud).
GitHub checks and Render deployments also run remotely after they are connected.

## Prepare the source

The release work is on `chore/production-readiness`, with the requested commit
message `improve system`. The owner reserved pushing the source. After reviewing
the changes, publish the branch:

```bash
git push -u origin chore/production-readiness
```

Do not start a cloud task against an older `main` and assume it contains local
changes. A cloud task needs the published release branch. Keep `.env` files,
credentials, and `SYSTEM_ENGINEERING_GUIDE.local.md` out of the published source.

## Start cloud work

In ChatGPT/Codex, choose **Work in → Cloud → Create environment**, connect
`Nil902/TripPlanner_Friend`, and publish the environment. Select the published
release branch when starting the task. If an environment already exists, select
it instead. Supply required service access through connected tools or secure
environment/network secrets.

The local CLI can also submit to a published environment:

```bash
codex cloud exec --env YOUR_ENVIRONMENT_ID --branch chore/production-readiness \
  'Continue the deployment described in docs/CLOUD_HANDOFF.md. Read AGENTS.md, docs/production-readiness-review.md, and docs/DEPLOYMENT.md first. Verify the release branch and CI results. Deploy the prepared app using free Render and free Neon only after the owner connects the accounts. Keep secrets out of source and output. The owner will push and merge source changes. Do not change settlement or budget algorithms. Run the public production smoke check after deployment and report the real service URL. If account access is missing, ask for the specific connection needed; do not claim deployment succeeded.'
```

Confirm that a task URL and running status appear before relying on remote
continuation. Merely saving a prompt or closing a local session does not start
cloud work. If the task needs missing account access, it can still pause for the
owner's input.

## Remaining release steps

1. Connect the owner's Render and Neon accounts and Render's GitHub integration.
2. Create a free Neon database and supply its TLS connection string securely to
   Render. The Blueprint generates a persistent signing key. Gemini and Maps
   keys are optional; without them the existing fallback planner is used.
3. Let GitHub CI validate the published branch, then have the owner review and
   merge it into `main`.
4. Create the free Render Blueprint from `render.yaml`, confirm the deployment
   becomes healthy, and run the public smoke check from the deployment guide.
5. Record the actual service URL and any remaining limitations.

Once Render is connected with `autoDeployTrigger: checksPass`, future pushes
merged into `main` deploy after GitHub checks pass, independently of the laptop.
The first live deployment and a cloud coding task are not active until their
respective account setup and launch have completed.
