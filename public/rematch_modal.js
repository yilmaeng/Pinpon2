// Rematch Modal Logic
let pendingRematch = null;
function showRematchModal(data) {
    pendingRematch = data;

    const modal = document.createElement('div');
    modal.id = 'rematch-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:1000;';
    modal.innerHTML = `
        <div style="background:#333;padding:20px;border-radius:10px;text-align:center;">
            <h2>Revanche İsteği</h2>
            <p>${data.nickname} sizinle bir maç daha yapmak istiyor.</p>
            <p>Kabul (Enter) / Red (Esc)</p>
            <button id="btn-rematch-accept">Kabul Et (Enter)</button>
            <button id="btn-rematch-decline">Reddet (Esc)</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-rematch-accept').onclick = () => respondRematch(true);
    document.getElementById('btn-rematch-decline').onclick = () => respondRematch(false);

    document.getElementById('btn-rematch-accept').focus();
}

function respondRematch(accepted) {
    if (!pendingRematch) return;

    const gameId = gameState ? gameState.gameId : null;
    socket.emit('rematch_response', {
        accepted,
        from: pendingRematch.from,
        gameId: gameId
    });

    document.getElementById('rematch-modal').remove();
    pendingRematch = null;

    if (!accepted) {
        location.reload();
    }
}

window.addEventListener('keydown', (e) => {
    if (pendingRematch) {
        if (e.code === 'Enter') respondRematch(true);
        if (e.code === 'Escape') respondRematch(false);
    }
});
