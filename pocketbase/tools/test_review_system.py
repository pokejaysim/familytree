#!/usr/bin/env python3
"""End-to-end tests for the PocketBase review system, against a THROWAWAY PocketBase.

Usage:  SU_EMAIL=... SU_PASSWORD=... python3 -I test_review_system.py http://127.0.0.1:8099

Never point this at the real server: it creates and deletes test people and test accounts.
Everything it uses is made up (people called "Test …", accounts @example.test, a generated
image), so it needs no family data. Prints one line per check and exits non-zero on any failure.
"""
import json
import os
import secrets
import struct
import sys
import urllib.error
import urllib.request
import uuid
import zlib

BASE = sys.argv[1].rstrip("/")
results = {"pass": 0, "fail": 0}


def check(ok, label):
    results["pass" if ok else "fail"] += 1
    print(("  ok    " if ok else "  FAIL  ") + label)


def png(seed):
    """A tiny valid 8x8 PNG, different for each seed."""
    rows = b"".join(b"\x00" + bytes([(seed * 31 + x + y) % 256 for x in range(8 * 3)]) for y in range(8))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def call(method, path, token=None, body=None, files=None):
    headers = {}
    data = None
    if token:
        headers["Authorization"] = token
    if files is not None:
        boundary = "sft" + secrets.token_hex(8)
        parts = []
        for k, v in (body or {}).items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (name, blob, ctype) in files.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + blob + b"\r\n")
        data = b"".join(parts) + f"--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def must(status_body, label="setup"):
    status, body = status_body
    if status != 200:
        sys.exit(f"{label} failed: {status} {body}")
    return body


su = must(call("POST", "/api/collections/_superusers/auth-with-password", body={"identity": os.environ["SU_EMAIL"], "password": os.environ["SU_PASSWORD"]}))["token"]
rec = lambda col, rid: call("GET", f"/api/collections/{col}/records/{rid}", su)
exists = lambda col, rid: rec(col, rid)[0] == 200
create = lambda col, data, files=None: must(call("POST", f"/api/collections/{col}/records", su, data, files), f"create {col}")


def login_as(role, status="approved", verified=True):
    email, pw = f"{role}-{secrets.token_hex(3)}@example.test", secrets.token_urlsafe(18)
    u = create("users", {"email": email, "password": pw, "passwordConfirm": pw, "name": f"Test {role}", "status": status, "role": role if role in ("admin", "editor", "viewer") else "viewer", "verified": verified})
    token = must(call("POST", "/api/collections/users/auth-with-password", body={"identity": email, "password": pw}), f"login {role}")["token"] if verified else None
    return u["id"], token


admin_id, admin = login_as("admin")
editor_id, editor = login_as("editor")
editor2_id, editor2 = login_as("editor")
viewer_id, viewer = login_as("viewer")
pending_id, pending = login_as("viewer", status="pending")

tree = create("trees", {"name": "Test tree"})["id"]
other_tree = create("trees", {"name": "Another test tree"})["id"]
dad = create("people", {"tree": tree, "given_names": "Test", "surname": "Father", "sex": "M"})["id"]
mum = create("people", {"tree": tree, "given_names": "Test", "surname": "Mother", "sex": "F"})["id"]
kid = create("people", {"tree": tree, "given_names": "Test", "surname": "Child", "sex": "F", "bio": "Original bio"})["id"]
fam = create("families", {"tree": tree, "partner1": dad, "partner2": mum, "union_type": "marriage"})["id"]
fc = create("family_children", {"family": fam, "person": kid, "relation": "biological"})["id"]
event = create("events", {"tree": tree, "person": kid, "type": "baptism", "date_text": "1990"})["id"]
source = create("sources", {"tree": tree, "title": "Test source"})["id"]
cit = create("citations", {"tree": tree, "source": source, "person": kid, "page": "1", "confidence": 2})["id"]
kid_png = png(1)
photo = create("media", {"tree": tree, "person": kid, "caption": "Test photo"}, {"file": ("kid.png", kid_png, "image/png")})
create_photo_link = must(call("PATCH", f"/api/collections/people/records/{kid}", su, {"photo": photo["id"]}))
stranger = create("people", {"tree": other_tree, "given_names": "Test", "surname": "Elsewhere"})["id"]


def submit(token, changes, summary="Test change", subject=None):
    return call("POST", "/api/sft/submit", token, {"tree": tree, "summary": summary, "subject": subject, "changes": changes})


def file_bytes(record, field="file"):
    tok = must(call("POST", "/api/files/token", su))["token"]
    s, b = call("GET", f"/api/files/{record['collectionId']}/{record['id']}/{record[field]}?token={tok}")
    return b if s == 200 else None


print("Sign-up and access")
s, b = call("POST", "/api/collections/users/records", body={"email": "newcomer@example.test", "password": "longpassword1", "passwordConfirm": "longpassword1", "name": "Newcomer", "note": "I'm a cousin", "status": "approved", "role": "admin", "verified": True})
check(s == 200, "anyone can sign up (and email not being set up doesn't break it)")
if s == 200:
    n = rec("users", b["id"])[1]
    check(n["status"] == "pending" and n["role"] == "viewer" and not n["verified"], "a new account is pending, view-only and unconfirmed, whatever the form sent")
    check(n["note"] == "I'm a cousin", "the sign-up note is kept")
check(call("POST", "/api/collections/users/auth-with-password", body={"identity": "newcomer@example.test", "password": "longpassword1"})[0] != 200, "an unconfirmed email can't sign in")
check(call("GET", "/api/collections/people/records", pending)[1].get("totalItems") == 0, "a pending account sees nobody")
check(call("GET", "/api/collections/people/records")[1].get("totalItems") == 0, "someone not signed in sees nobody")
check(call("GET", "/api/collections/people/records", viewer)[1].get("totalItems", 0) >= 3, "an approved member sees the family")
check(call("GET", "/api/collections/users/records", editor)[1].get("totalItems") == 1, "a member sees only their own account")
check(call("PATCH", f"/api/collections/users/records/{editor_id}", editor, {"role": "admin"})[0] != 200 and rec("users", editor_id)[1]["role"] == "editor", "a member can't make themselves admin")
check(call("PATCH", f"/api/collections/users/records/{editor_id}", editor, {"status": "approved", "name": "Renamed"})[0] != 200, "a member can't change their own status")
check(call("PATCH", f"/api/collections/users/records/{editor_id}", editor, {"name": "Test editor renamed"})[0] == 200, "a member can change their own name")
check(call("POST", "/api/collections/people/records", editor, {"tree": tree, "given_names": "Sneaky"})[0] != 200, "a contributor can't add a person directly")
check(call("PATCH", f"/api/collections/people/records/{dad}", editor, {"given_names": "Sneaky"})[0] != 200 and rec("people", dad)[1]["given_names"] == "Test", "a contributor can't edit a person directly")
check(call("DELETE", f"/api/collections/people/records/{dad}", editor)[0] != 204 and exists("people", dad), "a contributor can't delete a person directly")

print("Suggesting, reviewing and withdrawing")
s, b = submit(viewer, [{"table": "people", "op": "update", "key": {"id": dad}, "data": {"nickname": "x"}}])
check(s == 403, "a view-only member can't suggest changes")
s, b = submit(editor, [{"table": "people", "op": "update", "key": {"id": dad}, "data": {"nickname": "Pops"}}], subject=dad)
check(s == 200 and b.get("status") == "pending", "a contributor's change waits for review")
r1 = b.get("id")
check(rec("people", dad)[1]["nickname"] == "", "...and the tree is unchanged until it's approved")
check(call("GET", f"/api/collections/change_requests/records/{r1}", editor)[0] == 200, "the contributor can see their suggestion")
check(call("GET", f"/api/collections/change_requests/records/{r1}", editor2)[0] == 404, "other members can't see it")
check(must(call("GET", "/api/sft/counts", admin))["reviews"] == 1, "the admin's badge counts it")
check(must(call("GET", "/api/sft/counts", editor)) == {"reviews": 0, "members": 0}, "badges are zero for non-admins")
check(call("POST", "/api/sft/withdraw", editor2, {"id": r1})[0] == 400, "someone else can't withdraw it")
check(call("POST", "/api/sft/withdraw", editor, {"id": r1})[0] == 200 and rec("change_requests", r1)[1]["status"] == "withdrawn", "the contributor can withdraw it")
check(call("POST", "/api/sft/review", admin, {"id": r1, "approve": True})[0] == 400, "a withdrawn change can't be approved")
s, b = submit(editor, [{"table": "people", "op": "update", "key": {"id": dad}, "data": {"nickname": "Pops"}}])
check(call("POST", "/api/sft/review", editor, {"id": b["id"], "approve": True})[0] == 403, "a contributor can't approve")
check(call("POST", "/api/sft/review", admin, {"id": b["id"], "approve": False, "note": "Not quite"})[0] == 200
      and rec("change_requests", b["id"])[1]["status"] == "rejected" and rec("people", dad)[1]["nickname"] == "", "the admin can decline, with a note")
s, b = submit(editor, [{"table": "people", "op": "update", "key": {"id": dad}, "data": {"nickname": "Pops"}}])
check(call("POST", "/api/sft/review", admin, {"id": b["id"], "approve": True})[0] == 200 and rec("people", dad)[1]["nickname"] == "Pops", "approving puts the change in the tree")
check(submit(editor, [{"table": "people", "op": "update", "key": {"id": dad}, "data": {"made_up": 1}}])[0] == 400, "a change to a field that doesn't exist is refused")
check(submit(editor, [{"table": "people", "op": "update", "key": {"id": stranger}, "data": {"nickname": "x"}}])[0] == 400, "a change can't reach into another tree")
s, b = submit(admin, [{"table": "people", "op": "update", "key": {"id": mum}, "data": {"nickname": "Nana"}}])
check(s == 200 and b["status"] == "approved" and rec("people", mum)[1]["nickname"] == "Nana", "the admin's own change applies at once")

print("Adding new people in one go, and undo")
np, nc, nf = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
s, b = submit(editor, [
    {"table": "people", "op": "insert", "data": {"id": np, "given_names": "Test", "surname": "Spouse"}},
    {"table": "people", "op": "insert", "data": {"id": nc, "given_names": "Test", "surname": "Grandchild"}},
    {"table": "families", "op": "insert", "data": {"id": nf, "partner1": kid, "partner2": np}},
    {"table": "family_children", "op": "insert", "data": {"family": nf, "person": nc}},
], subject=np)
check(s == 200, "a contributor can suggest new people and link them in one change")
add = b.get("id")
check(rec("change_requests", add)[1]["subject_person"] == np, "...about a person who doesn't exist yet")
must(call("POST", "/api/sft/review", admin, {"id": add, "approve": True}))
check(all(exists("people", x) for x in (np, nc)) and exists("families", nf), "approving creates them all")
fresh = rec("people", np)[1]
check(fresh["sex"] == "U" and rec("families", nf)[1]["union_type"] == "marriage", "...with the usual defaults filled in")
logs = must(call("GET", f"/api/collections/change_log/records?filter=request='{add}'&perPage=100", admin))
check(logs["totalItems"] == 4, "the change history records all 4 additions")
must(call("POST", "/api/sft/revert", admin, {"id": add}))
check(not exists("people", np) and not exists("people", nc) and not exists("families", nf), "undo removes everything it added")
check(rec("change_requests", add)[1]["status"] == "reverted", "...and marks it undone")

print("Deleting a person with everything attached, and undo")
before_kid = rec("people", kid)[1]
s, b = submit(editor, [{"table": "people", "op": "delete", "key": {"id": kid}}], subject=kid)
gone = b["id"]
check(rec("change_requests", gone)[1]["changes"][0]["before"]["bio"] == "Original bio", "the review screen gets the person as they were")
must(call("POST", "/api/sft/review", admin, {"id": gone, "approve": True}))
check(not any(exists(c, i) for c, i in (("people", kid), ("events", event), ("citations", cit), ("media", photo["id"]), ("family_children", fc))),
      "deleting a person also removes their events, citations, photos and family links")
must(call("POST", "/api/sft/revert", admin, {"id": gone}))
check(all(exists(c, i) for c, i in (("people", kid), ("events", event), ("citations", cit), ("media", photo["id"]), ("family_children", fc))),
      "undo brings all of it back, with the same IDs")
after_kid = rec("people", kid)[1]
check(after_kid["photo"] == photo["id"] and after_kid["bio"] == before_kid["bio"] and after_kid["created_at"] == before_kid["created_at"], "...including the portrait link, the text and the original dates")
check(file_bytes(rec("media", photo["id"])[1]) == kid_png, "...and the photo file itself, byte for byte")
check(must(call("GET", f"/api/collections/uploads/records?filter=media_id='{photo['id']}'", su))["totalItems"] == 0, "the kept copy of the photo is tidied away after undo")

print("Photos from contributors")
s, up = call("POST", "/api/collections/uploads/records", editor, {"owner": editor2_id}, {"file": ("new.png", png(2), "image/png")})
check(s == 200 and up.get("owner") == editor_id and up.get("purpose") == "pending", "a contributor can upload a photo; it's theirs and waiting")
check(call("POST", "/api/collections/uploads/records", viewer, {}, {"file": ("v.png", png(3), "image/png")})[0] != 200, "a view-only member can't upload")
check(call("GET", f"/api/collections/uploads/records/{up['id']}", editor2)[0] == 404, "other members can't see someone's waiting photo")
check(call("GET", f"/api/collections/uploads/records/{up['id']}", admin)[0] == 200, "the admin can see it to review it")
check(submit(editor2, [{"table": "media", "op": "insert", "data": {"person": dad, "upload": up["id"]}}])[0] == 400, "nobody can use someone else's uploaded photo")
nm = str(uuid.uuid4())
s, b = submit(editor, [
    {"table": "media", "op": "insert", "data": {"id": nm, "person": dad, "upload": up["id"], "caption": "Test new photo", "mime_type": "image/png"}},
    {"table": "people", "op": "update", "key": {"id": dad}, "data": {"photo": nm}},
], subject=dad)
check(s == 200, "a contributor can suggest a new photo as someone's portrait")
must(call("POST", "/api/sft/review", admin, {"id": b["id"], "approve": True}))
check(rec("people", dad)[1]["photo"] == nm and file_bytes(rec("media", nm)[1]) == png(2), "approving moves the photo into the tree and sets the portrait")
check(not exists("uploads", up["id"]), "...and clears it out of the waiting area")
must(call("POST", "/api/sft/revert", admin, {"id": b["id"]}))
check(not exists("media", nm) and rec("people", dad)[1]["photo"] == "", "undo removes the photo and puts the old portrait back")
s, up = call("POST", "/api/collections/uploads/records", editor, {}, {"file": ("no.png", png(5), "image/png")})
s, b = submit(editor, [{"table": "media", "op": "insert", "data": {"person": dad, "upload": up["id"]}}])
must(call("POST", "/api/sft/review", admin, {"id": b["id"], "approve": False}))
check(not exists("uploads", up["id"]), "declining a photo deletes the upload")

print("Conflicts")
temp = create("people", {"tree": tree, "given_names": "Test", "surname": "Temporary"})["id"]
s, b = submit(editor, [{"table": "people", "op": "update", "key": {"id": temp}, "data": {"nickname": "Tem"}}])
call("DELETE", f"/api/collections/people/records/{temp}", su)
s2, b2 = call("POST", "/api/sft/review", admin, {"id": b["id"], "approve": True})
check(s2 == 400 and "since been changed or removed" in str(b2), "approving a change to someone deleted meanwhile explains why it can't")
check(rec("change_requests", b["id"])[1]["status"] == "pending", "...and leaves it waiting, nothing half-done")
dash = must(call("GET", f"/api/collections/change_log/records?filter=row_key.id='{temp}'%26%26op='delete'", admin))
check(dash["totalItems"] == 1 and dash["items"][0]["request"] == "", "edits made in the dashboard are in the change history too")

print("This is me")
check(call("POST", "/api/sft/claim", pending, {"person": dad})[0] in (400, 401, 403), "an unapproved account can't claim a person")
check(call("POST", "/api/sft/claim", editor, {"person": dad})[0] == 200 and rec("users", editor_id)[1]["person_status"] == "pending", "a member can say 'this is me'; it waits for the admin")
check(must(call("GET", "/api/sft/counts", admin))["reviews"] >= 1, "the admin's badge counts it")
check(call("POST", "/api/sft/review-claim", editor, {"user": editor_id, "approve": True})[0] == 403, "a member can't confirm their own claim")
must(call("POST", "/api/sft/review-claim", admin, {"user": editor_id, "approve": True}))
check(rec("users", editor_id)[1]["person_status"] == "approved", "the admin can confirm it")
check(call("POST", "/api/sft/claim", editor2, {"person": dad})[0] == 400, "nobody else can claim the same person")
check(call("POST", "/api/sft/claim", editor, {"person": None})[0] == 200 and rec("users", editor_id)[1]["person"] == "", "a member can remove their link")
must(call("POST", "/api/sft/claim", admin, {"person": mum}))
check(rec("users", admin_id)[1]["person_status"] == "approved", "the admin's own link applies at once")
check(must(call("GET", "/api/sft/counts", admin))["members"] == 2, "the admin's badge counts accounts waiting for approval (the pending one and the sign-up)")

print("Admin page")
check(bool(rec("users", editor_id)[1].get("last_seen")), "signing in records when a member was last here")
check(call("POST", "/api/sft/link-member", editor, {"user": editor2_id, "person": dad})[0] == 403, "only the admin can link members to the tree")
must(call("POST", "/api/sft/link-member", admin, {"user": editor2_id, "person": dad}))
u = rec("users", editor2_id)[1]
check(u["person"] == dad and u["person_status"] == "approved", "the admin can link a member to their person, at once")
check(call("POST", "/api/sft/link-member", admin, {"user": viewer_id, "person": dad})[0] == 400, "...but not to someone another member is already linked to")
check(call("POST", "/api/sft/link-member", admin, {"user": editor2_id, "person": None})[0] == 200 and rec("users", editor2_id)[1]["person"] == "", "the admin can clear a member's link")

print("Welcome video")
check(not rec("users", viewer_id)[1].get("welcomed_at"), "a member hasn't seen the welcome yet")
check(call("POST", "/api/sft/welcomed")[0] == 401, "marking it seen needs a signed-in member")
check(call("POST", "/api/sft/welcomed", viewer, {"id": editor_id})[0] == 200 and bool(rec("users", viewer_id)[1].get("welcomed_at")) and not rec("users", editor_id)[1].get("welcomed_at"), "it marks only your own account")
first = rec("users", viewer_id)[1]["welcomed_at"]
call("POST", "/api/sft/welcomed", viewer)
check(rec("users", viewer_id)[1]["welcomed_at"] == first, "the first time is kept")

print("Help page messages")
msg = {"name": "Cousin", "email": "cousin@example.test", "message": "Hello, I can't sign in."}
check(call("POST", "/api/sft/contact", None, {**msg, "email": "nope"})[0] == 400, "a message needs a real-looking email to reply to")
check(call("POST", "/api/sft/contact", None, {**msg, "message": ""})[0] == 400, "a message can't be empty")
check(call("POST", "/api/sft/contact", None, {**msg, "website": "spam.example"})[0] == 200, "robots filling the hidden field are quietly ignored")
tries = [call("POST", "/api/sft/contact", None, msg)[0] for _ in range(4)]
check(429 not in tries[:3] and tries[3] == 429, "anyone can send a message, but only 3 an hour from one address")

print("Site health")
check(call("GET", "/api/sft/health", editor)[0] == 403, "only the admin can see site health")
h = must(call("GET", "/api/sft/health", admin))
check(h["totals"]["people"] >= 2 and h["storage"]["used"] and h["storage"]["site"]["free"] > 0, "site health counts people and reports disk space")
check("password" not in json.dumps(h).lower() and "username" not in json.dumps(h).lower(), "site health returns no email login details")
check(h["email"]["ready"] is False, "with email off, site health says email isn't set up")
check(call("POST", "/api/sft/test-email", editor)[0] == 403, "only the admin can send a test email")
s2, b2 = call("POST", "/api/sft/test-email", admin)
check(s2 == 400 and "isn't set up" in str(b2), "with email off, a test email explains why it can't be sent")

print(f"\n{results['pass']} passed, {results['fail']} failed")
sys.exit(1 if results["fail"] else 0)
