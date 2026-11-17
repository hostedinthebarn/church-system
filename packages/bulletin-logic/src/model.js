// Puts the sections together for one week: what each one says, which switches
// are on, and what the office should look at before signing off.
import { SECTIONS, SERVING_ROLES, standingIds } from './sections.js';
import {
  addDaysIso, fillBirthdays, fillEvents, fillServing, isSunday, longDate, textToBlocks
} from './fill.js';

// The previous Sunday before a Sunday `weekOf`: the figures are for it.
export function previousSunday(weekOf) {
  return addDaysIso(weekOf, -7);
}

// Contact and service times fall back to the site's published details when the
// office hasn't typed their own.
function standingText(id, standing, site) {
  const typed = (standing && standing[id]) || '';
  if (typed.trim()) {
    return typed;
  }
  if (id === 'contact' && site && site.contact) {
    return [ site.city, site.contact.phone && `Phone: ${site.contact.phone}`, site.contact.email && `Email: ${site.contact.email}` ]
      .filter(Boolean).join('\n');
  }
  if (id === 'serviceTimes' && site && site.serviceTimes) {
    return site.serviceTimes.map(item => `- ${item.label}: ${item.time}`).join('\n');
  }
  return '';
}

function handBlocks(section, hand) {
  const blocks = [];
  for (const field of section.fields) {
    if (field.type === 'date') {
      continue;
    }
    const inner = textToBlocks(hand[field.key]);
    if (!inner.length) {
      continue;
    }
    if (field.heading) {
      blocks.push({ type: 'subheading', text: field.heading });
    }
    blocks.push(...inner);
  }
  return blocks;
}

// input
//   weekOf         Sunday 'YYYY-MM-DD' this bulletin is for
//   hand           typed values by field key
//   standing       set-once text by section id
//   site           the church's config (contact, serviceTimes)
//   assignments    roster-logic assignments; names maps person id to name
//   events         calendar events; eventChoices the office's ticks
//   people, relationships   directory data, used only when includeBirthdays
//   switches       the church's print/website overrides (already applied)
export function buildBulletin({
  weekOf, hand = {}, standing = {}, site = {}, assignments = [], names = {},
  events = [], eventChoices = {}, people = [], relationships = [],
  includeBirthdays = false, sections = SECTIONS, roles = SERVING_ROLES
}) {
  const warnings = [];
  if (!isSunday(weekOf)) {
    warnings.push({ code: 'not-sunday', message: `${weekOf} is not a Sunday.` });
  }
  const serving = fillServing({
    assignments, names, sunday: weekOf, roles
  });
  if (serving.unfilled) {
    warnings.push({ code: 'unfilled', message: `${serving.unfilled} serving slot(s) are still unfilled.` });
  }
  const eventList = fillEvents({ events, printDate: weekOf, choices: eventChoices });
  const figuresDate = hand.figuresDate || previousSunday(weekOf);
  if (hand.figuresDate && hand.figuresDate !== previousSunday(weekOf)) {
    warnings.push({
      code: 'figures-date',
      message: `The figures are dated ${longDate(hand.figuresDate)}; last Sunday was ${longDate(previousSunday(weekOf))}.`
    });
  }
  const birthdayItems = includeBirthdays ? fillBirthdays({ people, relationships, from: weekOf }) : [];
  const standingSet = new Set(standingIds(sections));

  const built = sections.map(section => {
    let blocks = [];
    if (section.source === 'hand') {
      blocks = handBlocks(section, hand);
      if (section.id === 'figures') {
        blocks.unshift({ type: 'date', text: longDate(figuresDate) });
      }
    } else if (standingSet.has(section.id)) {
      blocks = textToBlocks(standingText(section.id, standing, site));
    } else if (section.source === 'events') {
      blocks = eventList.included.length ? [ { type: 'events', items: eventList.included } ] : [];
    } else if (section.source === 'roster') {
      blocks = [ { type: 'serving', groups: serving.groups } ];
    } else if (section.source === 'directory') {
      blocks = birthdayItems.length ? [ { type: 'dated', items: birthdayItems } ] : [];
    }
    return {
      id: section.id,
      title: section.title,
      panel: section.panel,
      order: section.order,
      source: section.source,
      print: section.print,
      website: section.website,
      blocks,
      empty: blocks.length === 0
    };
  }).sort((a, b) => a.panel.localeCompare(b.panel) || a.order - b.order);

  return {
    weekOf,
    heading: longDate(weekOf),
    sections: built,
    eventCandidates: eventList.candidates,
    warnings
  };
}

// What one target shows. `print` and `website` keep only the sections whose
// switch is on. The website also drops every members-only event, ticked or
// not: it is public.
export function viewFor(model, target) {
  if (target !== 'print' && target !== 'website') {
    throw new RangeError(`Unknown target "${target}"`);
  }
  const sections = model.sections
    .filter(section => section[target])
    .map(section => {
      if (target === 'print') {
        return section;
      }
      const blocks = section.blocks.map(block => (block.type === 'events'
        ? { ...block, items: block.items.filter(item => !item.memberOnly) }
        : block)).filter(block => block.type !== 'events' || block.items.length);
      return { ...section, blocks, empty: blocks.length === 0 };
    });
  return { ...model, sections, target };
}
