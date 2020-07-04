// Copyright (c) 2017 Greg Merrill
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
        if (chord.notes.length == 4) {
          var range = VOCAL_RANGE[i];
          if (range.low > note.magnitude()) {
            violations.push({ measure: chord.measure, message: "Too low for " + VOICE_NAME[i] + " vocal range: " + note});
          }
          else if (range.high < note.magnitude()) {
            violations.push({ measure: chord.measure, message: "Too high for " + VOICE_NAME[i] + " vocal range: " + note});
          }
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
            violations.push({ measure: chord.measure, message: "Excessive spacing between " + VOICE_NAME[i] + " and " + VOICE_NAME[i + 1] + ": " + n1 + " > " + n2});
          }
        }
      }
    });
  },
  "Parallel Fifths and Octaves" : function(chords, violations) {
    withChordPairs(chords, function(interval, prevInterval, chord, prevChord) {
      if (prevInterval.movesParallelTo(interval)) {
        if (interval.delta % 12 == 7) {
          violations.push({ measure: prevChord.measure, message: "Parallel Fifths: " + multiMeasureMessage(prevChord, prevInterval, chord, interval)});
        }
        else if (interval.delta % 12 == 0) {
          violations.push({ measure: prevChord.measure, message: "Parallel Octaves: " + multiMeasureMessage(prevChord, prevInterval, chord, interval)});
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
            violations.push({ measure: chord.measure, message: "Voices crossed: " + VOICE_NAME[i] + " and " + VOICE_NAME[i + 1] + ": " + n1 + " > " + n2});
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
        violations.push({ measure: prevChord.measure, message: "Octaves by Contrary Motion: " + multiMeasureMessage(prevChord, prevInterval, chord, interval)});
      }
      else if ((interval.delta % 12 == 7) && (prevInterval.delta % 12 == 7)) {
        violations.push({ measure: prevChord.measure, message: "Fifths by Contrary Motion: " + multiMeasureMessage(prevChord, prevInterval, chord, interval)});
      }
    });
  },
  "Hidden (Direct) Fifths and Octaves" : function(chords, violations) {
    withChordPairs(chords, function(interval, prevInterval, chord, prevChord) {
      if (interval.lowVoice != 0 || interval.highVoice != 3) return;
      if (interval.delta % 12 != 7 && interval.delta % 12 != 0) return;
      
      var lowDelta = prevInterval.low.magnitude() - interval.low.magnitude();
      var highDelta = prevInterval.high.magnitude() - interval.high.magnitude();
      if (Math.abs(lowDelta) < 3 || Math.abs(highDelta) < 3) return;
      if ((lowDelta < 0 && highDelta > 0) || (lowDelta > 0 && highDelta < 0)) return;
      
      var type = interval.delta % 12 == 7 ? "Fifth" : "Octave"
      violations.push({ measure: prevChord.measure, message: "Hidden " + type + ": " + multiMeasureMessage(prevChord, prevInterval, chord, interval)});
    });
  }
}

function multiMeasureMessage(prevChord, prevInterval, chord, interval) {
  return (prevChord.measure == chord.measure)
    ? prevInterval + ' to ' + interval
    : 'measure ' + prevChord.measure + ' ' + prevInterval + ' to measure ' + chord.measure + ' ' + interval;
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
    var sortedChords = [];
    $.each(m.chords, function(j, chord) { sortedChords.push(chord); });
    sortedChords.sort(function(a, b) { return a.index - b.index; });
    console.info('Measure ' + (i+1));
    $.each(sortedChords, function(j, chord) { 
      console.info(chord.toString());
      chord.measure = m.number;
      consolidatedChords.push(chord);
    });
  });

  var violations = [];
  var rules = ["Vocal Range", "Spacing Between Voices", "Parallel Fifths and Octaves", "Voice Crossing", "Consecutive Fifths and Octaves by Contrary Motion", "Hidden (Direct) Fifths and Octaves"];
  $.each(rules, function(i, rule) {
    RULES[rule].call(this, consolidatedChords, violations);
  });
  
  violations.sort(function(v1, v2) {
    var measureDelta = v1.measure - v2.measure;
    return measureDelta || v1.message.localeCompare(v2.message);
  });
  
  return violations;
}

function parseMeasures(xml) {
  var clefByPartByStaff = {};
  $(xml).find('clef').each(function() {
    var sign = $($(this).find('sign')[0]).text();
    var partID = $(this).parent().parent().parent().attr('id');
    if (!clefByPartByStaff[partID]) {
      clefByPartByStaff[partID] = {};
    }
    var octave = sign == 'G' ? 4 : 3;
    var clefOctaveChange = 0;
    if ($(this).find('clef-octave-change').length > 0) {
      clefOctaveChange = +$(this).find('clef-octave-change').text();
    }
    var clef = {
      sign: sign,
      octave: octave,
      clefOctaveChange: clefOctaveChange,
      magnitude: octave * 12 + (clefOctaveChange * 12) + NOTE_OFFSETS[sign]
    };
    if (!clefByPartByStaff[partID][partID]) clefByPartByStaff[partID][partID] = clef; // default clef for part
    clefByPartByStaff[partID][+$(this).attr('number')] = clef; // specific clef when there are multiple staves in the part
  });

  var measures = [];
  $(xml).find('part').each(function() {
    $(this).find('measure').each(function() {
      var i = $(this).attr('number') - 1;
      var measure = measures[i] || { 
        number: i + 1, 
        chords: {}
      };
      measures[i] = measure;
      parseMeasure($(this), measure, clefByPartByStaff);
    });
  });

  // Handles scenarios where entire measures are missing
  measures = $.grep(measures, function(m) { return m; });
  
  $(measures).each(function(i, m) { 
    $.each(m.chords, function(p, chord) {
      chord.notes.sort(function(a, b) { 
        var delta = a.clef.magnitude - b.clef.magnitude;
        return delta != 0 ? delta : a.magnitude() - b.magnitude(); 
      });
      chord.notes = chord.notes.slice(0, 4);
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
      return this.delta == other.delta && this.lowVoice == other.lowVoice && this.highVoice == other.highVoice
        && !(this.low.magnitude() == other.low.magnitude() && this.high.magnitude() == other.high.magnitude());
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

function newNoteFromXml(node, duration, clefByPartByStaff) {
  var partID = node.parent().parent().attr('id');
  var staff = +node.find('staff').text();
  var clef = clefByPartByStaff[partID][staff] || clefByPartByStaff[partID][partID];
  return newNote(
    node.find('pitch').find('step').text(),
    node.find('pitch').find('octave').text(),
    +node.find('pitch').find('alter').text(),
    duration,
    clef);
}

function newNote(step, octave, alter, duration, clef) {
  return {
    step: step,
    octave: octave,
    alter: alter,
    duration: duration,
    clef: clef,
    getSymbol: function() { 
      return this.step + ({ '-1': 'b', '-2': 'bb', '1': '#', '2': 'x' }[this.alter] || '');
    },
    getSymbolWithOctave: function() { return this.getSymbol() + this.octave; },
    toString: function() { return this.getSymbolWithOctave() },
    magnitude: function() { return (this.octave * 12) + NOTE_OFFSETS[this.step] + this.alter; }
  };
}

function parseMeasure(xml, measure, clefByPartByStaff) {
  var pos = 0;
  var prevNote;
  $(xml).find('note, backup').each(function() {
    var node = $(this);
    var type = node.prop('tagName');
    
    var divisions = 1;
    var measWithDivisions = xml;
    while ($(measWithDivisions).find('attributes').length == 0 || $($(measWithDivisions).find('attributes')[0]).find('divisions').length == 0) {
      measWithDivisions = $(measWithDivisions).prev();
    }
    var divisions = +$($(measWithDivisions).find('attributes')[0]).find('divisions').text();

    var duration = node.find('duration').text();
    duration = duration / divisions;
    
    if (type == 'backup') {
      pos -= duration;
    }
    else { // note
      if (node.find('chord').size() == 1) {
        pos -= prevNote.duration;
      }
      
      if (node.find('rest').size() == 1) {
        // For purposes of voice leading, treat rests as if they are extensions of the previous note
        if (prevNote) prevNote.duration += duration;
      }
      else {
        var chord = measure.chords[pos] || newChord(pos);
        measure.chords[pos] = chord;

        var note = newNoteFromXml(node, duration, clefByPartByStaff);
        
        chord.notes.push(note);
        prevNote = note;
      }
      pos += duration;
    }
  });
}
