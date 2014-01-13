// Copyright (c) 2014  Greg Merrill
// See https://github.com/greghmerrill/voice-leading for license

var NOTE_OFFSETS = { 'C' : 0, 'D' : 2, 'E' : 4, 'F' : 5, 'G' : 7, 'A' : 9, 'B' : 11 };
var VOCAL_RANGE = $.map(['E2-C4', 'C3-F4', 'G3-D5', 'C4-A5'], function(pair) {
  return { low: newNote(pair[0], +pair[1], 0, 0).magnitude(), high: newNote(pair[3], +pair[4], 0, 0).magnitude() };
});
var SPACING = { 0: 19, 1: 12, 2: 12, 3: 12 };
var VOICE_NAME = { 0: 'Bass', 1: 'Tenor', 2: 'Alto', 3: 'Soprano' };

var RULES = {
  "Vocal Range" : function(chords, violations) {
    $.each(chords, function(p, chord) {
      $.each(chord.notes, function(i, note) {
        var range = VOCAL_RANGE[i];
        if (range.low > note.magnitude()) {
          violations.push("Too low for vocal range: measure " + chord.measure + " " + note);
        }
        else if (range.high < note.magnitude()) {
          violations.push("Too high for vocal range: measure " + chord.measure + " " + note);
        }
      });
    });
  },
  "Spacing Between Voices" : function(chords, violations) {
    $.each(chords, function(p, chord) {
      if (chord.notes.length == 4) {
        for (var i = 0; i < 3; i++) {
          var spacing = SPACING[i];
          var n1 = chord.notes[i];
          var n2 = chord.notes[i + 1];
          if (n2.magnitude() - n1.magnitude() > spacing) {
            violations.push("Excessive spacing between " + VOICE_NAME[i] + " and " + VOICE_NAME[i + 1] + ": measure " + chord.measure + " " + n1 + " > " + n2);
          }
        }
      }
    });
  },
  "Parallel Fifths and Octaves" : function(chords, violations) {
    withChordPairs(chords, function(interval, prevInterval, chord, prevChord) {
      if (prevInterval.movesParallelTo(interval)) {
        if (interval.delta == 7) {
          violations.push("Parallel Fifths: measure " + prevChord.measure + ' ' + prevInterval + ' to measure ' + chord.measure + ' ' + interval);
        }
        else if (interval.delta == 12) {
          violations.push("Parallel Octaves: measure " + prevChord.measure + ' ' + prevInterval + ' to measure ' + chord.measure + ' ' + interval);
        }
      }
    });
  },
  "Voice Crossing" : function(chords, violations) {
    $.each(chords, function(p, chord) {
      if (chord.notes.length == 4) {
        for (var i = 0; i < 3; i++) {
          var n1 = chord.notes[i];
          var n2 = chord.notes[i + 1];
          if (n2.magnitude() < n1.magnitude()) {
            violations.push("Voices crossed: " + VOICE_NAME[i] + " and " + VOICE_NAME[i + 1] + ": measure " + chord.measure + " " + n1 + " > " + n2);
          }
        }
      }
    });
  },
  "Consecutive Fifths and Octaves by Contrary Motion" : function(chords, violations) {
    withChordPairs(chords, function(interval, prevInterval, chord, prevChord) {
      if (interval.delta == prevInterval.delta) { /* Not contrary motion */ return; }
      if (interval.low.getSymbol() == prevInterval.low.getSymbol() && interval.high.getSymbol() == prevInterval.high.getSymbol()) { /* Not really "moving" */ return; }
      if ((interval.delta % 12 == 0) && (prevInterval.delta % 12 == 0)) {
        violations.push("Octaves by Contrary Motion: measure " + prevChord.measure + ' ' + prevInterval + ' to measure ' + chord.measure + ' ' + interval);
      }
      else if ((interval.delta % 12 == 7) && (prevInterval.delta % 12 == 7)) {
        violations.push("Fifths by Contrary Motion: measure " + prevChord.measure + ' ' + prevInterval + ' to measure ' + chord.measure + ' ' + interval);
      }
    });
  }
}

function withChordPairs(chords, fn) {
  var prevChord;
  var prevChordIntervals;
  $.each(chords, function(p, chord) {
    var chordIntervals = chord.getIntervals();
    if (prevChordIntervals && prevChord.notes.length == chord.notes.length) {
      $.each(chordIntervals, function(i, interval) {
        fn(interval, prevChordIntervals[i], chord, prevChord);
      });
    }
    prevChord = chord;
    prevChordIntervals = chordIntervals;
  });
}

function validate(xml) {
  var measures = parseMeasures(xml);

  var consolidatedChords = [];
  $.each(measures, function(i, m) { 
    $.each(m.chords, function(j, chord) { 
      chord.measure = m.number;
      consolidatedChords.push(chord);
    });
  });

  var violations = [];
  $.each(["Vocal Range", "Spacing Between Voices", "Parallel Fifths and Octaves", "Voice Crossing", "Consecutive Fifths and Octaves by Contrary Motion"], function(i, rule) {
    RULES[rule].call(this, consolidatedChords, violations);
  });
  
  return violations;
}

function parseMeasures(xml) {
  var clefByStaff = {};
  $(xml).find('clef').each(function() {
    var sign = $($(this).find('sign')[0]).text();
    clefByStaff[+$(this).attr('number')] = sign;
  });

  var measures = [];
  $(xml).find('part').each(function() {
    $(this).find('measure').each(function() {
      var i = $(this).attr('number') - 1;
      var measure = measures[i] || { number: i + 1, chords: {} };
      measures[i] = measure;
      parseMeasure($(this), measure, clefByStaff);
    });
  });
  
  $(measures).each(function(i, m) { 
    $.each(m.chords, function(p, chord) {
      chord.notes.sort(function(a, b) { 
        var delta = a.clef.charCodeAt() - b.clef.charCodeAt(); // F < G :-)
        return delta != 0 ? delta : a.magnitude() - b.magnitude(); 
      });
    });
  });
  return measures;
}

function newInterval(lowNote, highNote, lowVoice, highVoice) {
  return {
    low: lowNote,
    high: highNote,
    lowVoice: lowVoice,
    highVoice: highVoice,
    delta: highNote.magnitude() - lowNote.magnitude(),
    toString: function() { return this.low + ' > ' + this.high; },
    movesParallelTo: function(other) {
      return this.delta == other.delta && this.low.magnitude() != other.low.magnitude() && this.lowVoice == other.lowVoice && this.highVoice == other.highVoice;
    }
  }
}

function newChord(pos) {
  return { 
    index: pos, 
    notes: [], 
    toString: function() { return this.notes.toString(); },
    getIntervals: function(chord) {
      var intervals = [];
      for (var i = 0; i < this.notes.length; i++) {
        for (var j = i + 1; j < this.notes.length; j++) {
          intervals.push(newInterval(this.notes[i], this.notes[j], i, j));
        }
      }
      return intervals;
    }
  };
}

function newNoteFromXml(node, clefByStaff) {
  return newNote(
    node.find('pitch').find('step').text(),
    node.find('pitch').find('octave').text(),
    +node.find('pitch').find('alter').text(),
    +node.find('duration').text(),
    clefByStaff[+node.find('staff').text()]);
}

function newNote(step, octave, alter, duration, clef) {
  return {
    step: step,
    octave: octave,
    alter: alter,
    duration: duration,
    clef: clef,
    getSymbol: function() { 
      return this.step + ({ '-1': 'b', 'bb': '--', '1': '#', '2': '##' }[this.alter] || '');
    },
    getSymbolWithOctave: function() { return this.getSymbol() + this.octave; },
    toString: function() { return this.getSymbolWithOctave() },
    magnitude: function() { return (this.octave * 12) + NOTE_OFFSETS[this.step] + this.alter; }
  };
}

function parseMeasure(xml, measure, clefByStaff) {
  var pos = 0;
  var prevNote;
  $(xml).find('note, backup').each(function() {
    var node = $(this);
    var type = node.prop('tagName');
    if (type == 'backup') {
      pos -= node.find('duration').text();
    }
    else { // note
      if (node.find('chord').size() == 1) {
        pos -= prevNote.duration;
      }
      
      var duration = +node.find('duration').text();
      if (node.find('rest').size() == 1) {
        // For purposes of voice leading, treat rests as if they are extensions of the previous note
        if (prevNote) prevNote.duration += duration;
      }
      else {
        var chord = measure.chords[pos] || newChord(pos);
        measure.chords[pos] = chord;

        var note = newNoteFromXml(node, clefByStaff);
        
        chord.notes.push(note);
        prevNote = note;
      }
      pos += duration;
    }
  });
}
