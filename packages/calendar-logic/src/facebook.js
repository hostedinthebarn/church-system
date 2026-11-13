import { toMs } from './dates.js';

function sameMoment(a, b) {
  return toMs(a) === toMs(b);
}

function timeMoved(prev, cur) {
  return !sameMoment(prev.startsAt, cur.startsAt) || !sameMoment(prev.endsAt, cur.endsAt);
}

function detailsChanged(prev, cur) {
  return timeMoved(prev, cur) || prev.place !== cur.place;
}

// What to do on Facebook when an event changes. Returns one of:
//   'none'            nothing
//   'post'            make the first post (for a cancelled regular service the
//                     post should read CANCELLED, from current.status)
//   'edit-updated'    edit the existing post, "Updated:" at the start
//   'edit-cancelled'  edit the existing post to "CANCELLED" (never delete)
//
// previous: the event before the change, or null (just created or no change)
// current:  { isPublic, isRegularService, status, startsAt, endsAt, place,
//             announceFrom, facebookOnChange? }  facebookOnChange is the
//             regular-service tick-box, on unless false
// posted:   whether the event already has a Facebook post
// now:      the current instant
// Members-only events never go to Facebook. Regular services only for a
// cancelled or moved occurrence, and only with the tick-box on.
export function facebookAction({ previous, current, posted, now }) {
  if (!current.isPublic) {
    return 'none';
  }
  const cancelledNow =
    previous !== null && current.status === 'cancelled' && previous.status !== 'cancelled';

  if (current.isRegularService) {
    const relevant = cancelledNow || (previous !== null && timeMoved(previous, current));
    if (!relevant || current.facebookOnChange === false) {
      return 'none';
    }
    if (!posted) {
      return 'post';
    }
    return cancelledNow ? 'edit-cancelled' : 'edit-updated';
  }

  if (!posted) {
    const due = toMs(current.announceFrom) <= toMs(now) && toMs(current.startsAt) > toMs(now);
    return due && current.status !== 'cancelled' ? 'post' : 'none';
  }
  if (cancelledNow) {
    return 'edit-cancelled';
  }
  if (current.status !== 'cancelled' && previous !== null && detailsChanged(previous, current)) {
    return 'edit-updated';
  }
  return 'none';
}
