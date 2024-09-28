var navianimation = gsap.timeline({paused: true})
    .to("#menuSheet", {yPercent: 100, duration: 1, ease: "expo.inOut"});

document.getElementById("menuButton").onclick = () => {
    if (navianimation.reversed()) {
        navianimation.play();
        document.body.classList.add("no-scroll");
    } else {
        navianimation.reverse();
        document.body.classList.remove("no-scroll");
    }
};

// CSS to disable body scroll and allow menuSheet scroll
document.head.insertAdjacentHTML("beforeend", `
    <style>
        .no-scroll {
            overflow: hidden;
        }
        #menuSheet {
            overflow-y: auto;
        }
    </style>
`);
