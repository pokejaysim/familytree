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
import urllib.parse
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
s2, b2 = call("POST", "/api/collections/users/auth-with-password", body={"identity": "newcomer@example.test", "password": "longpassword1"})
check(s2 == 200, "a new member can sign in straight away (approval is the only step)")
if s2 == 200:
    check(call("GET", "/api/collections/people/records", b2["token"])[1].get("totalItems") == 0, "...but sees nobody until approved")
    check(call("POST", "/api/sft/submit", b2["token"], {"tree": "x", "changes": [{"table": "people", "op": "insert", "data": {"given_names": "X"}}]})[0] == 403, "...and can't suggest changes until approved")
check(call("POST", "/api/collections/users/auth-with-password", body={"identity": "newcomer@example.test", "password": "wrong-password"})[0] == 400, "a wrong password still doesn't work")
s4, b4 = call("POST", "/api/collections/users/records", body={"email": "approve-me@example.test", "password": "longpassword1", "passwordConfirm": "longpassword1", "name": "Approve Me"})
t4 = must(call("POST", "/api/collections/users/auth-with-password", body={"identity": "approve-me@example.test", "password": "longpassword1"}), "sign in approve-me")["token"]
s3, _ = call("PATCH", f"/api/collections/users/records/{b4['id']}", admin, {"status": "approved", "role": "editor"})
check(s3 == 200 and rec("users", b4["id"])[1]["status"] == "approved", "the admin can approve them (the you're-in email can't block it)")
check(call("GET", "/api/collections/people/records", t4)[1].get("totalItems", 0) >= 1, "...and then they see the family without signing in again")
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
s5, b5 = call("POST", "/api/sft/claim", editor2, {"person": dad})
check(s5 == 200 and rec("users", editor2_id)[1]["person_status"] == "pending", "claiming someone already linked just waits for the admin, like any claim")
check("linked" not in json.dumps(b5).lower() and "someone" not in json.dumps(b5).lower(), "...and doesn't reveal that person has an account")
s6, b6 = call("POST", "/api/sft/review-claim", admin, {"user": editor2_id, "approve": True})
check(s6 == 400 and "already linked" in str(b6) and rec("users", editor2_id)[1]["person_status"] == "pending", "the admin can't confirm a clash by mistake, and is told who is already linked")
must(call("POST", "/api/sft/review-claim", admin, {"user": editor2_id, "approve": False}))
check(rec("users", editor2_id)[1]["person"] == "", "the admin can decline the clashing claim")
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

print("Privacy: members only see their own account")
for who, tok, uid in (("a contributor", editor, editor_id), ("a view-only member", viewer, viewer_id)):
    lst = must(call("GET", "/api/collections/users/records?perPage=200", tok))
    check(lst["totalItems"] == 1 and lst["items"][0]["id"] == uid, f"{who} can only list their own account")
    check(call("GET", f"/api/collections/users/records/{admin_id}", tok)[0] == 404, f"{who} can't open anyone else's account")
    seen = must(call("GET", "/api/collections/users/records?filter=" + urllib.parse.quote("last_seen != ''"), tok))
    check(all(u["id"] == uid for u in seen["items"]), f"{who} can't find out who else has signed in")
    check(must(call("GET", "/api/collections/tree_members/records", tok))["totalItems"] == 0, f"{who} can't list the tree's members")
    check(must(call("GET", "/api/collections/change_log/records", tok))["totalItems"] == 0, f"{who} can't read the change history")
    owner = must(call("GET", "/api/collections/trees/records?expand=owner", tok))["items"]
    check(all(not (t.get("expand") or {}).get("owner") for t in owner), f"{who} can't see the tree owner's account through the tree")
check(must(call("GET", "/api/collections/users/records?perPage=200", admin))["totalItems"] >= 5, "the admin can see every account")
before = rec("users", editor_id)[1]
call("PATCH", f"/api/collections/users/records/{editor_id}", editor, {"last_seen": "2020-01-01 00:00:00.000Z"})
call("PATCH", f"/api/collections/users/records/{editor_id}", editor, {"welcomed_at": ""})
after = rec("users", editor_id)[1]
check(after["last_seen"] == before["last_seen"] and after["welcomed_at"] == before["welcomed_at"], "a member can't change their own last visit or welcome record")
check(call("GET", "/api/collections/people/records", pending)[1].get("totalItems", 0) == 0, "an account waiting for approval sees nobody in the tree")

print("The server's admin side is closed to the internet")
def via_cloudflare(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "Cf-Ray": "test", "Cf-Connecting-Ip": "203.0.113.9", **({"Authorization": token} if token else {})})
    try:
        with urllib.request.urlopen(req) as res: return res.status
    except urllib.error.HTTPError as err: return err.code
creds = {"identity": os.environ["SU_EMAIL"], "password": os.environ["SU_PASSWORD"]}
sid = must(call("GET", "/api/collections/_superusers", su))["id"]
for spelling in ("_superusers", "_SUPERUSERS", "_SuperUsers", sid):
    check(via_cloudflare("POST", f"/api/collections/{spelling}/auth-with-password", None, creds) == 404, f"the admin sign-in is closed from the internet, spelled {spelling if spelling != sid else 'by its id'}")
check(via_cloudflare("POST", "/api/collections/_SUPERUSERS/request-password-reset", None, {"email": os.environ["SU_EMAIL"]}) == 404, "...and so is its password reset")
check(via_cloudflare("GET", "/_/") == 404 and via_cloudflare("GET", "/api/settings", su) == 404 and via_cloudflare("GET", "/api/collections/users/records", su) == 404, "the dashboard and an admin token don't work from the internet")
check(call("GET", "/api/settings", su)[0] == 200, "the admin side still works from the home network (Tailscale)")
check(via_cloudflare("GET", "/api/collections/people/records", editor) == 200 and via_cloudflare("POST", "/api/collections/users/auth-with-password", None, {"identity": "x@example.test", "password": "wrong-password"}) == 400, "members are unaffected")

print("Sign in with Google")
# A stand-in for Google on this machine (PocketBase's generic OIDC provider pointed at it), so the real
# OAuth2 sign-in path runs end to end: the "code" picks which made-up Google account comes back.
import http.server, threading
FAKE_ACCOUNTS = {
    "new": {"sub": "g-new", "email": "google-newcomer@example.test", "name": "Test Google Newcomer", "email_verified": True},
    "sneaky": {"sub": "g-sneaky", "email": "google-sneaky@example.test", "name": "Test Sneaky", "email_verified": True},
    "existing": {"sub": "g-existing", "email": "has-password@example.test", "name": "Test Existing", "email_verified": True},
}
class FakeGoogle(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def reply(self, obj):
        raw = json.dumps(obj).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_POST(self):  # token exchange: hand back an access token naming the account
        form = urllib.parse.parse_qs(self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode())
        self.reply({"access_token": "tok-" + form.get("code", [""])[0], "token_type": "Bearer", "expires_in": 3600})
    def do_GET(self):  # user info
        self.reply(FAKE_ACCOUNTS.get(self.headers.get("Authorization", "").replace("Bearer tok-", ""), {}))
fake = http.server.HTTPServer(("127.0.0.1", 0), FakeGoogle)
threading.Thread(target=fake.serve_forever, daemon=True).start()
fake_url = f"http://127.0.0.1:{fake.server_address[1]}"
must(call("PATCH", "/api/collections/users", su, {"oauth2": {"enabled": True, "providers": [{"name": "oidc", "clientId": "test", "clientSecret": "test-secret",
     "authURL": fake_url + "/auth", "tokenURL": fake_url + "/token", "userInfoURL": fake_url + "/userinfo", "displayName": "Test"}]}}), "set up the stand-in Google")
def google_sign_in(code, create_data=None):
    p = next(x for x in must(call("GET", "/api/collections/users/auth-methods"))["oauth2"]["providers"] if x["name"] == "oidc")
    return call("POST", "/api/collections/users/auth-with-oauth2", body={"provider": "oidc", "code": code, "codeVerifier": p["codeVerifier"], "redirectURL": "https://simfamilytree.com/", **({"createData": create_data} if create_data else {})})
s_, b_ = google_sign_in("new")
nu = b_.get("record", {}) if s_ == 200 else {}
check(s_ == 200 and b_.get("meta", {}).get("isNew") is True, "a new relative can sign up with Google")
check(nu.get("status") == "pending" and nu.get("role") == "viewer", "...and waits for approval as a view-only account, like the sign-up form")
check(nu.get("name") == "Test Google Newcomer" and nu.get("email") == "google-newcomer@example.test", "...with the name and email from their Google account")
check(s_ == 200 and call("GET", "/api/collections/people/records", b_["token"])[1].get("totalItems", 0) == 0, "...and sees nobody in the tree until approved")
s_, b_ = google_sign_in("sneaky", {"status": "approved", "role": "admin", "person": dad, "person_status": "approved"})
sn = b_.get("record", {}) if s_ == 200 else {}
check(s_ == 200 and sn.get("status") == "pending" and sn.get("role") == "viewer" and not sn.get("person"), "a Google sign-up can't make itself approved, an admin or someone in the tree")
s_, b_ = google_sign_in("new")
check(s_ == 200 and b_["record"]["id"] == nu.get("id") and b_.get("meta", {}).get("isNew") is False, "signing in with Google again lands in the same account")
pw = secrets.token_urlsafe(18)
existing = must(call("POST", "/api/collections/users/records", body={"email": "has-password@example.test", "password": pw, "passwordConfirm": pw, "name": "Test Existing"}), "sign up with a password")
s_, b_ = google_sign_in("existing")
check(s_ == 200 and b_["record"]["id"] == existing["id"] and b_.get("meta", {}).get("isNew") is False, "someone who joined with a password and the same address lands in their own account with Google")
check(call("POST", "/api/collections/users/auth-with-password", body={"identity": "has-password@example.test", "password": pw})[0] == 400,
      "...and their old password stops working (PocketBase's guard against someone signing up with another person's address)")

print("Turning Google sign-in on and off from the Admin page")
GID = "1234567890-abcdefghijklmnop.apps.googleusercontent.com"
check(all(call(m, "/api/sft/google", tok, {"clientId": GID, "clientSecret": "GOCSPX-test-secret-123"} if m == "POST" else None)[0] in (401, 403) for m in ("GET", "POST", "DELETE") for tok in (None, editor, pending)),
      "only an admin can see or change Google sign-in")
check(call("POST", "/api/sft/google", admin, {"clientId": "not-a-client-id", "clientSecret": "GOCSPX-test-secret-123"})[0] == 400, "a wrong-looking client ID is refused")
check(call("POST", "/api/sft/google", admin, {"clientId": GID, "clientSecret": "short"})[0] == 400, "a wrong-looking client secret is refused")
s_, b_ = call("POST", "/api/sft/google", admin, {"clientId": GID, "clientSecret": "GOCSPX-test-secret-123"})
check(s_ == 200 and b_.get("on") is True and "GOCSPX" not in json.dumps(b_), "the admin can switch it on, and the secret isn't sent back")
check(must(call("GET", "/api/sft/google", admin)) == {"on": True, "clientId": GID}, "the Admin page can see it's on")
providers = must(call("GET", "/api/collections/users/auth-methods"))["oauth2"]["providers"]
g = next((x for x in providers if x["name"] == "google"), None)
check(g is not None and [x["name"] for x in providers] == ["google"], "the sign-in page is offered Google (and only Google)")
check(bool(g) and g["authURL"].startswith("https://accounts.google.com/") and "client_id=" + GID in g["authURL"] and "code_challenge=" in g["authURL"] and g["authURL"].endswith("redirect_uri="),
      "...with a Google link the site can finish with its own address")
check(call("POST", "/api/collections/users/auth-with-oauth2", body={"provider": "google", "code": "made-up", "codeVerifier": g["codeVerifier"] if g else "", "redirectURL": "https://simfamilytree.com/"})[0] == 400,
      "a made-up Google code is turned away")
check(call("DELETE", "/api/sft/google", admin)[0] == 200 and must(call("GET", "/api/collections/users/auth-methods"))["oauth2"]["providers"] == [] and must(call("GET", "/api/sft/google", admin))["on"] is False,
      "the admin can switch it off again")
fake.shutdown()

print("Family news")
# A stand-in mail server on this machine catches the emails, so the tests can read exactly what each member gets.
import socketserver
from email import message_from_string, policy as email_policy
MAILS = []
class FakeSMTP(socketserver.StreamRequestHandler):
    def handle(self):
        def w(line):
            self.wfile.write((line + "\r\n").encode()); self.wfile.flush()
        w("220 test")
        mail = {"to": [], "data": ""}
        while True:
            raw = self.rfile.readline()
            if not raw:
                return
            cmd = raw.decode(errors="replace").strip()
            up = cmd.upper()
            if up.startswith(("EHLO", "HELO")):
                w("250-test"); w("250 8BITMIME")
            elif up.startswith("MAIL FROM"):
                mail = {"to": [], "data": ""}; w("250 ok")
            elif up.startswith("RCPT TO"):
                addr = cmd.split(":", 1)[1].strip().strip("<>")
                if addr.startswith("news-bounce"):
                    w("550 no such mailbox")  # an address that always fails
                else:
                    mail["to"].append(addr); w("250 ok")
            elif up == "DATA":
                w("354 go")
                lines = []
                while True:
                    l = self.rfile.readline()
                    if l in (b".\r\n", b".\n", b""):
                        break
                    lines.append(l.decode(errors="replace"))
                mail["data"] = "".join(lines); MAILS.append(mail); w("250 queued")
            elif up == "QUIT":
                w("221 bye"); return
            else:
                w("250 ok")
class SMTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True
smtp = SMTPServer(("127.0.0.1", 0), FakeSMTP)
threading.Thread(target=smtp.serve_forever, daemon=True).start()
before_settings = must(call("GET", "/api/settings", su))
must(call("PATCH", "/api/settings", su, {"smtp": {"enabled": True, "host": "127.0.0.1", "port": smtp.server_address[1], "username": "", "password": "", "tls": False},
                                          "meta": {"senderAddress": "family@example.test", "senderName": "Sim Family Tree", "appURL": "https://simfamilytree.com"}}), "point email at the stand-in")

s_, post = call("POST", "/api/collections/news/records", admin, {"title": "Test news", "body": "**26 November 2026**\n\nHello <b>everyone</b>.\nA second line.\n\nAnother paragraph.",
                                                                  "author": viewer_id, "emailed_count": 99, "sent_to": [viewer_id]})
check(s_ == 200 and post.get("author") == admin_id and post.get("emailed_count") == 0, "an admin can post news, and it's theirs with nothing marked as emailed")
check(call("POST", "/api/collections/news/records", editor, {"title": "Not allowed"})[0] != 200, "an editor can't post news")
items = must(call("GET", "/api/collections/news/records", viewer))["items"]
check(any(i["id"] == post["id"] for i in items) and all("sent_to" not in i for i in items), "a member can read the news, but not who it was emailed to")
check(call("GET", "/api/collections/news/records", pending)[1].get("totalItems", 0) == 0 and call("GET", "/api/collections/news/records")[1].get("totalItems", 0) == 0,
      "someone waiting for approval, or not signed in, can't read it")
s_, b_ = call("PATCH", f"/api/collections/news/records/{post['id']}", admin, {"title": "Test news", "emailed_count": 50, "author": viewer_id})
check(s_ == 200 and b_["emailed_count"] == 0 and b_["author"] == admin_id, "editing a post can't change its author or email tally")
check(call("POST", f"/api/sft/news/{post['id']}/send", editor)[0] == 403 and call("POST", f"/api/sft/news/{post['id']}/send")[0] in (401, 403), "only an admin can email the news")

check(must(call("POST", "/api/sft/news/emails", viewer, {"on": False})) == {"on": False} and rec("users", viewer_id)[1]["news_emails_off"] is True, "a member can switch the news emails off")
for i in range(8):  # enough members that the email goes out in more than one go
    create("users", {"email": f"news-reader-{i}-{secrets.token_hex(2)}@example.test", "password": "longpassword1", "passwordConfirm": "longpassword1", "name": f"Test Reader {i}", "status": "approved", "role": "viewer"})
create("users", {"email": "news-bounce@example.test", "password": "longpassword1", "passwordConfirm": "longpassword1", "name": "Test Bounce", "status": "approved", "role": "viewer"})
approved = must(call("GET", "/api/collections/users/records?perPage=500&filter=" + urllib.parse.quote("status='approved'"), su))["items"]
expected = {u["email"] for u in approved if not u["news_emails_off"] and not u["email"].startswith("news-bounce")}
def send_run():
    rounds, sent_n, failed_n = 0, 0, 0
    while rounds < 20:
        rounds += 1
        r = must(call("POST", f"/api/sft/news/{post['id']}/send", admin, {"again": rounds == 1}), "send news")
        sent_n += r["sent"]; failed_n += r["failed"]
        if r["remaining"] == 0:
            break
    return rounds, sent_n, failed_n
rounds, sent_total, failed_total = send_run()
to = [m["to"] for m in MAILS]
check(sent_total == len(expected) and {t[0] for t in to} == expected, f"the news reaches every approved member who wants it ({len(expected)}), in {rounds} goes")
check(all(len(t) == 1 for t in to) and len(to) == len({t[0] for t in to}), "each member gets their own email, once, with nobody else's address on it")
check(rounds >= 2, "a big family is emailed a few at a time, so no single request runs long")
viewer_email = rec("users", viewer_id)[1]["email"]
check(viewer_email not in expected and all(t[0] != viewer_email for t in to), "a member who switched the emails off doesn't get one")
check(failed_total == 1, "an address that fails is reported, and doesn't stop everyone after it")
again = send_run()
check(again[1] == 0 and again[2] == 1 and len(MAILS) == sent_total, "sending again tries the failed address once more, and doesn't email anyone twice")
check(rec("news", post["id"])[1]["emailed_count"] == sent_total, "the post shows how many it was emailed to")
editor_email = rec("users", editor_id)[1]["email"]
mail = message_from_string(next(m["data"] for m in MAILS if m["to"] == [editor_email]), policy=email_policy.default)
admin_email = rec("users", admin_id)[1]["email"]
html_part = mail.get_body(("html",)).get_content()
check(mail["Subject"] == "Family news: Test news" and admin_email in str(mail["Reply-To"]), "the email is titled with the post, and replies go to the admin who sent it")
check("&lt;b&gt;everyone" in html_part and "<strong>26 November 2026</strong>" in html_part and f"https://simfamilytree.com/news/{post['id']}" in html_part,
      "the words come through as written (no hidden code), with a link to the post")
off_link = str(mail["List-Unsubscribe"]).strip("<>")
check(off_link.startswith("https://simfamilytree.com/?news-off=") and off_link in html_part, "every email has a stop-these-emails link, for people and for mail apps")
u_, k_ = off_link.split("news-off=", 1)[1].split(".", 1)
check(call("POST", "/api/sft/news/off", None, {"u": u_, "k": "wrong-key-wrong-key-1234"})[0] == 400 and call("POST", "/api/sft/news/off", None, {"u": viewer_id, "k": k_})[0] == 400,
      "the link only works with that member's own key")
check(call("POST", "/api/sft/news/off", None, {"u": u_, "k": k_})[0] == 200 and rec("users", editor_id)[1]["news_emails_off"] is True, "the link switches the emails off without signing in")
check("unsub_key" not in must(call("GET", f"/api/collections/users/records/{editor_id}", editor)) and all("unsub_key" not in u for u in must(call("GET", "/api/collections/users/records?perPage=200", admin))["items"]),
      "nobody can read the keys behind those links, not even an admin")
pw = secrets.token_urlsafe(18)
newbie = must(call("POST", "/api/collections/users/records", body={"email": "news-newbie@example.test", "password": pw, "passwordConfirm": pw, "name": "Test Newbie", "unsub_key": "chosen-by-me-0000000000", "news_emails_off": True}), "sign up")
nb = rec("users", newbie["id"])[1]
check(len(nb.get("unsub_key", "")) == 24 and nb["unsub_key"] != "chosen-by-me-0000000000" and nb["news_emails_off"] is False, "a new sign-up gets its own random key and starts with the emails on")
check(must(call("POST", "/api/sft/news/emails", viewer, {"on": True})) == {"on": True} and rec("users", viewer_id)[1]["news_emails_off"] is False, "...and a member can switch them back on")
check(call("DELETE", f"/api/collections/news/records/{post['id']}", editor)[0] != 204 and call("DELETE", f"/api/collections/news/records/{post['id']}", admin)[0] == 204, "only an admin can delete a post")
must(call("PATCH", "/api/settings", su, {"smtp": {"enabled": False}, "meta": {"senderAddress": before_settings["meta"]["senderAddress"], "appURL": before_settings["meta"]["appURL"]}}), "put email back")
smtp.shutdown()

print(f"\n{results['pass']} passed, {results['fail']} failed")
sys.exit(1 if results["fail"] else 0)
