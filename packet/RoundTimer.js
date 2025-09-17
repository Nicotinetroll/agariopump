function RoundTimer(phase, timeLeft, roundNum, winner) {
    this.phase = phase;
    this.timeLeft = timeLeft;
    this.roundNum = roundNum;
    this.winner = winner || "";
}

module.exports = RoundTimer;

RoundTimer.prototype.build = function() {
    var buf = new ArrayBuffer(13 + (this.winner.length * 2));
    var view = new DataView(buf);
    
    view.setUint8(0, 250, true); // Custom packet ID
    view.setUint8(1, this.phase, true);
    view.setUint16(2, this.timeLeft, true);
    view.setUint16(4, this.roundNum, true);
    
    // Add winner name if exists
    var offset = 6;
    for (var i = 0; i < this.winner.length; i++) {
        view.setUint16(offset, this.winner.charCodeAt(i), true);
        offset += 2;
    }
    view.setUint16(offset, 0, true); // String terminator
    
    return buf;
};
