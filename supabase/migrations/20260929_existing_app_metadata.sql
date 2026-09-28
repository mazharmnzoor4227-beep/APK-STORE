-- Verified GitHub repository metadata for existing published listings.
-- Star counts are snapshots; a scheduled refresh may replace them.
update public.apps as a set
  github_owner = m.owner,
  github_repo = m.repo,
  source_url = 'https://github.com/' || m.owner || '/' || m.repo,
  license = m.license,
  short_description = m.summary,
  stars = m.stars,
  category = m.category,
  is_recommended = m.recommended
from (values
  ('fossify-calculator','FossifyOrg','Calculator','GPL-3.0','A simple calculator without ads',447,'Productivity',false),
  ('fossify-calendar','FossifyOrg','Calendar','GPL-3.0','Events and widgets without ads',2185,'Productivity',true),
  ('fossify-file-manager','FossifyOrg','File-Manager','GPL-3.0','Manage files with privacy in mind',1785,'File management',true),
  ('fossify-voice-recorder','FossifyOrg','Voice-Recorder','GPL-3.0','Record audio without ads or internet access',1000,'Audio',false),
  ('hail','aistra0528','Hail','GPL-3.0','Disable, hide or suspend Android apps',6775,'Automation',true),
  ('record-you','you-apps','RecordYou','GPL-3.0','Privacy-focused audio and screen recorder',863,'Audio',false),
  ('shizuku','RikkaApps','Shizuku','Apache-2.0','Use system APIs with adb or root privileges',30719,'Shizuku implementations',true)
) as m(slug,owner,repo,license,summary,stars,category,recommended)
where a.slug = m.slug and a.visibility = 'published';
